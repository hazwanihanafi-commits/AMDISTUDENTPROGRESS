// server.js

import timelineRoutes from './routes/timeline.js';
app.use('/api', timelineRoutes);

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const {google} = require('googleapis');
const path = require('path');
const csvStringify = require('csv-stringify/lib/sync');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// session
app.use(session({
  secret: process.env.SESSION_SECRET || 'replace_me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

// serve static
app.use(express.static(path.join(__dirname, 'public')));

// get envs
const SHEET_ID = process.env.SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.SERVICE_ACCOUNT_JSON;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@usm.my';
const SUPERVISOR_DOMAIN = process.env.SUPERVISOR_DOMAIN || 'usm.my';

// setup Google Sheets client
if (!SERVICE_ACCOUNT_JSON) {
  console.warn('SERVICE_ACCOUNT_JSON is not set. Google Sheets API will not work until provided.');
}

let sheetsClient = null;
async function getSheets() {
  if (sheetsClient) return sheetsClient;
  if (!SERVICE_ACCOUNT_JSON) throw new Error('Missing SERVICE_ACCOUNT_JSON');
  const key = typeof SERVICE_ACCOUNT_JSON === 'string' ? JSON.parse(SERVICE_ACCOUNT_JSON) : SERVICE_ACCOUNT_JSON;
  const jwt = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  await jwt.authorize();
  sheetsClient = google.sheets({version: 'v4', auth: jwt});
  return sheetsClient;
}

// Utility: fetch MasterTracking range and parse into array of objects (header -> row)
async function readMasterTracking() {
  if (!SHEET_ID) throw new Error('SHEET_ID missing');
  const sheets = await getSheets();
  // read a large enough range
  const range = 'MasterTracking!A1:Z2000';
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  const rows = res.data.values || [];
  if (!rows.length) return [];
  const headers = rows[0].map(h => (h||'').toString().trim());
  const data = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] !== undefined ? row[i] : '';
    });
    data.push(obj);
  }
  return data;
}

// Determine role by email. Returns { role: 'admin'|'supervisor'|'student'|null, details: {} }
async function getUserRole(email) {
  if (!email) return { role: null };
  if (email.toLowerCase() === (ADMIN_EMAIL||'').toLowerCase()) {
    return { role: 'admin', details: { email } };
  }
  // read sheet and search
  const rows = await readMasterTracking();
  // Normalize keys by trying a few typical column names:
  const studentEmailFields = ['Student Email', 'StudentEmail', 'Email'];
  const supervisorEmailFields = ['Supervisor Email', 'SupervisorEmail', 'SupervisorEmailAddress', 'SupervisorEmail1'];

  // 1) Check if this email belongs to a supervisor (exists in any supervisor column)
  const supMatches = rows.filter(r => supervisorEmailFields.some(k => r[k] && r[k].toLowerCase() === email.toLowerCase()));
  if (supMatches.length) {
    // get distinct students supervised by this email
    const students = supMatches.map(r => ({
      name: r['Student Name'] || r['StudentName'] || r['Name'] || '',
      matric: r['Matric No'] || r['Matric'] || r['StudentID'] || r['MatricNo'] || '',
      row: r
    }));
    return { role: 'supervisor', details: { email, students } };
  }

  // 2) Check if this is a student email
  const studentMatches = rows.filter(r => studentEmailFields.some(k => r[k] && r[k].toLowerCase() === email.toLowerCase()));
  if (studentMatches.length) {
    // If multiple rows for the same email, return first
    const r = studentMatches[0];
    return { role: 'student', details: {
      email,
      name: r['Student Name'] || r['StudentName'] || '',
      matric: r['Matric No'] || r['Matric'] || r['MatricNo'] || ''
    }};
  }

  return { role: null };
}

// Middleware: require login
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  // if AJAX request respond 401
  if (req.xhr || req.headers.accept.indexOf('application/json') > -1) {
    return res.status(401).json({ status: 'error', message: 'Not authenticated' });
  }
  return res.redirect('/login.html');
}

// Middleware: require role
function requireRole(role) {
  return function (req, res, next) {
    if (!req.session || !req.session.user) return res.status(401).send('Not authenticated');
    if (req.session.user.role !== role) return res.status(403).send('Forbidden');
    return next();
  };
}

/* -----------------------
   AUTH ROUTES
   ----------------------- */

// POST /login
// Accepts { email } — (students & supervisors use email login)
app.post('/login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ status:'error', message:'Email required' });

    const user = await getUserRole(email.trim());
    if (!user.role) {
      return res.status(403).json({ status:'error', message:'Email not registered' });
    }
    // store session
    req.session.user = { role: user.role, email: email.trim(), details: user.details };
    return res.json({ status:'ok', role: user.role });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ status:'error', message: err.toString() });
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

/* -----------------------
   PROTECTED PAGES (server-side guard)
   ----------------------- */

// Student dashboard (protected)
app.get('/student', requireLogin, (req, res) => {
  if (req.session.user.role !== 'student') return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'dashboard-student.html'));
});

// Supervisor dashboard
app.get('/supervisor', requireLogin, (req, res) => {
  if (req.session.user.role !== 'supervisor') return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'dashboard-supervisor.html'));
});

// Admin dashboard
app.get('/admin', requireLogin, (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'dashboard-admin.html'));
});

/* -----------------------
   API endpoints used by front-end
   ----------------------- */

// GET /api/status?matric= or user-specific
app.get('/api/status', requireLogin, async (req, res) => {
  try {
    const rows = await readMasterTracking();

    // If student: return their row
    if (req.session.user.role === 'student') {
      const email = req.session.user.email.toLowerCase();
      const r = rows.find(r => (r['Student Email']||'').toLowerCase() === email);
      if (!r) return res.json({ status:'error', message:'Student row not found' });
      return res.json({ status:'ok', role:'student', row: r, raw: r });
    }

    // Supervisor or admin can query by matric param
    const matric = req.query.matric;
    if (!matric) return res.json({ status:'error', message:'matric required' });

    // find row by Matric or Matric No
    const r = rows.find(r => {
      const m = (r['Matric No']||r['Matric']||'').toString();
      return m === matric.toString();
    });

    if (!r) return res.json({ status:'error', message:'not found' });

    // for supervisors, ensure they are allowed to view this student
    if (req.session.user.role === 'supervisor') {
      const supEmail = req.session.user.email.toLowerCase();
      const supFields = ['Supervisor Email','SupervisorEmail','Supervisor'];
      const isAssigned = supFields.some(k => (r[k]||'').toLowerCase() === supEmail);
      if (!isAssigned) return res.json({ status:'error', message:'not allowed' });
    }

    return res.json({ status:'ok', role: req.session.user.role, row: r, raw: r });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status:'error', message: err.toString() });
  }
});

// /api/approve  (POST) — supervisor approves student milestone
app.post('/api/approve', requireLogin, async (req, res) => {
  try {
    const { matric, stage } = req.body;
    if (!matric || !stage) return res.status(400).json({ status:'error', message:'matric/stage required' });

    // Only supervisors or admin can approve
    if (!['supervisor','admin'].includes(req.session.user.role)) {
      return res.status(403).json({ status:'error', message:'not allowed' });
    }

    // find sheet row index so we can update approval timestamp
    const sheets = await getSheets();
    const readRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'MasterTracking!A1:Z2000' });
    const rows = readRes.data.values || [];
    const headers = rows[0] || [];
    const matricIndex = headers.findIndex(h => ['Matric No','Matric','MatricNo','MatricNumber'].includes(h));
    // find row
    let rowIndex = -1;
    for (let r = 1; r < rows.length; r++) {
      const m = rows[r][matricIndex] || '';
      if (m.toString() === matric.toString()) { rowIndex = r+1; break; } // sheets rows are 1-indexed
    }
    if (rowIndex === -1) return res.json({ status:'error', message:'student not found' });

    // find approval column depending on stage, try to find a header like 'P1 Approved' etc.
    const approvalHeaderCandidates = [`${stage} Approved`, `${stage}Approved`, `${stage}_Approved`, `${stage} Approve`];
    let approvalCol = -1;
    for (let i = 0; i < headers.length; i++) {
      if (approvalHeaderCandidates.includes(headers[i])) { approvalCol = i+1; break; }
    }
    // if not found, attempt to fallback to nearest column (we will append)
    if (approvalCol === -1) {
      // append a new column with header
      const appendHeader = `${stage} Approved`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `MasterTracking!${String.fromCharCode(65+headers.length)}1:${String.fromCharCode(65+headers.length)}1`,
        valueInputOption: 'RAW',
        resource: { values: [[appendHeader]] }
      });
      approvalCol = headers.length + 1;
    }

    // write timestamp to the found cell
    const timestamp = (new Date()).toLocaleString();
    const colLetter = String.fromCharCode(64 + approvalCol);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `MasterTracking!${colLetter}${rowIndex}:${colLetter}${rowIndex}`,
      valueInputOption: 'RAW',
      resource: { values: [[timestamp]] }
    });

    return res.json({ status:'ok', message: 'approved', stage, matric, timestamp });

  } catch (err) {
    console.error('approve err', err);
    return res.status(500).json({ status:'error', message: err.toString() });
  }
});

// /api/dashboardData (summary)
app.get('/api/dashboardData', requireLogin, async (req, res) => {
  try {
    const rows = await readMasterTracking();
    const totals = { total: rows.length, P1:0, P3:0, P4:0, P5:0, completed:0 };
    rows.forEach(r => {
      if (r['P1 Submitted'] || r['P1']) totals.P1++;
      if (r['P3 Submitted'] || r['P3']) totals.P3++;
      if (r['P4 Submitted'] || r['P4']) totals.P4++;
      if (r['P5 Submitted'] || r['P5']) totals.P5++;
      if ((r['P1 Submitted']||r['P3 Submitted']||r['P4 Submitted']||r['P5 Submitted']) &&
          (r['P1 Approved'] && r['P3 Approved'] && r['P4 Approved'] && r['P5 Approved'])) totals.completed++;
    });
    res.json({ status:'ok', totals, stages: { P1:totals.P1, P3:totals.P3, P4:totals.P4, P5:totals.P5 } });
  } catch (err) {
    res.status(500).json({ status:'error', message: err.toString() });
  }
});

// approval_log: return simple CSV of approvals
app.get('/api/approval_log', requireLogin, async (req, res) => {
  try {
    // only admin and supervisors allowed
    if (!['admin','supervisor'].includes(req.session.user.role)) return res.status(403).send('forbidden');
    const rows = await readMasterTracking();
    // produce flattened CSV with key fields
    const csvRows = rows.map(r => ({
      StudentName: r['Student Name'] || r['StudentName'] || '',
      Matric: r['Matric No'] || r['Matric'] || '',
      P1Approved: r['P1 Approved'] || '',
      P3Approved: r['P3 Approved'] || '',
      P4Approved: r['P4 Approved'] || '',
      P5Approved: r['P5 Approved'] || ''
    }));
    const csv = csvStringify(csvRows, { header: true });
    res.setHeader('Content-disposition', 'attachment; filename=approval_log.csv');
    res.set('Content-Type', 'text/csv');
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).send(err.toString());
  }
});

// health
app.get('/api/health', async (req, res) => {
  try {
    await getSheets();
    res.json({ status:'ok', message:'sheets ok' });
  } catch (err) {
    res.json({ status:'error', message: err.toString() });
  }
});

// start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

