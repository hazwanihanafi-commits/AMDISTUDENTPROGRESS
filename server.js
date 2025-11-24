// server.js — COMPLETE FIXED VERSION FOR RENDER (ES MODULES)

import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import cors from 'cors';
import { google } from 'googleapis';
import path from 'path';
import { stringify } from 'csv-stringify/sync';
import apiTimelineRoutes from './routes/timeline.js';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// FIX __dirname FOR ES MODULES
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CREATE APP FIRST
// ---------------------------------------------------------------------------
const app = express();

// ---------------------------------------------------------------------------
// MIDDLEWARE
// ---------------------------------------------------------------------------
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'replace_me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

// STATIC FILES
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// ROUTES (timeline first)
// ---------------------------------------------------------------------------
app.use('/api', apiTimelineRoutes);

// ---------------------------------------------------------------------------
// ENV VARIABLES
// ---------------------------------------------------------------------------
const SHEET_ID = process.env.SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.SERVICE_ACCOUNT_JSON;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@usm.my';

// ---------------------------------------------------------------------------
// GOOGLE SHEETS CLIENT
// ---------------------------------------------------------------------------
let sheetsClient = null;

async function getSheets() {
  if (sheetsClient) return sheetsClient;

  const creds = JSON.parse(SERVICE_ACCOUNT_JSON);
  const jwt = new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  await jwt.authorize();
  sheetsClient = google.sheets({ version: 'v4', auth: jwt });
  return sheetsClient;
}

// ---------------------------------------------------------------------------
// READ MASTERTRACKING
// ---------------------------------------------------------------------------
async function readMasterTracking() {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'MasterTracking!A1:Z2000'
  });

  const rows = res.data.values || [];
  if (!rows.length) return [];

  const headers = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] || '';
    });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// AUTH / ROLE
// ---------------------------------------------------------------------------
async function getUserRole(email) {
  if (!email) return { role: null };
  const rows = await readMasterTracking();

  const stuFields = ['Student Email', 'Email'];
  const supFields = ['Supervisor Email'];

  if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return { role: 'admin', details: { email } };
  }

  const supMatches = rows.filter(r =>
    supFields.some(k => (r[k] || '').toLowerCase() === email.toLowerCase())
  );

  if (supMatches.length) {
    return {
      role: 'supervisor',
      details: {
        email,
        students: supMatches.map(r => ({
          name: r['Student Name'],
          matric: r['Matric No']
        }))
      }
    };
  }

  const stuMatches = rows.filter(r =>
    stuFields.some(k => (r[k] || '').toLowerCase() === email.toLowerCase())
  );

  if (stuMatches.length) {
    const s = stuMatches[0];
    return {
      role: 'student',
      details: {
        email,
        name: s['Student Name'],
        matric: s['Matric No']
      }
    };
  }

  return { role: null };
}

function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login.html');
}

// ---------------------------------------------------------------------------
// AUTH ROUTES
// ---------------------------------------------------------------------------
app.post('/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ status: 'error', message: 'Email required' });

  const user = await getUserRole(email);
  if (!user.role) return res.json({ status: 'error', message: 'Email not registered' });

  req.session.user = user;
  res.json({ status: 'ok', role: user.role });
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

// ---------------------------------------------------------------------------
// DASHBOARDS
// ---------------------------------------------------------------------------
app.get('/student', requireLogin, (req, res) => {
  if (req.session.user.role !== 'student') return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'dashboard-student.html'));
});

app.get('/supervisor', requireLogin, (req, res) => {
  if (req.session.user.role !== 'supervisor') return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'dashboard-supervisor.html'));
});

app.get('/admin', requireLogin, (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'dashboard-admin.html'));
});

// ---------------------------------------------------------------------------
// API: STATUS (student or supervisor query)
// ---------------------------------------------------------------------------
app.get('/api/status', requireLogin, async (req, res) => {
  const rows = await readMasterTracking();

  if (req.session.user.role === 'student') {
    const email = req.session.user.details.email.toLowerCase();
    const r = rows.find(row => (row['Student Email'] || '').toLowerCase() === email);
    return res.json({ status: 'ok', row: r });
  }

  const matric = req.query.matric;
  const r = rows.find(r => r['Matric No'] == matric || r['Matric'] == matric);
  return res.json({ status: 'ok', row: r });
});

// ---------------------------------------------------------------------------
// API: APPROVE (supervisor/admin)
// ---------------------------------------------------------------------------
app.post('/api/approve', requireLogin, async (req, res) => {
  const { matric, stage } = req.body;

  if (!['supervisor', 'admin'].includes(req.session.user.role)) {
    return res.status(403).json({ status: 'error', message: 'not allowed' });
  }

  const sheets = await getSheets();
  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'MasterTracking!A1:Z2000'
  });

  const rows = read.data.values || [];
  const headers = rows[0];
  const mIndex = headers.indexOf('Matric No');

  let rowId = rows.findIndex(r => r[mIndex] == matric);

  if (rowId === -1) return res.json({ status: 'error', message: 'not found' });

  const approvalCol = headers.indexOf(`${stage} Approved`);
  if (approvalCol === -1) return res.json({ status: 'error', message: 'missing column' });

  const colLetter = String.fromCharCode(65 + approvalCol);
  const timestamp = new Date().toLocaleString();

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `MasterTracking!${colLetter}${rowId + 1}`,
    valueInputOption: 'RAW',
    resource: { values: [[timestamp]] }
  });

  return res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// API: DASHBOARD SUMMARY
// ---------------------------------------------------------------------------
app.get('/api/dashboardData', requireLogin, async (req, res) => {
  const rows = await readMasterTracking();
  const totals = {
    total: rows.length,
    P1: rows.filter(r => r['P1 Submitted']).length,
    P3: rows.filter(r => r['P3 Submitted']).length,
    P4: rows.filter(r => r['P4 Submitted']).length,
    P5: rows.filter(r => r['P5 Submitted']).length
  };
  res.json({ status: 'ok', totals });
});

// ---------------------------------------------------------------------------
// API: APPROVAL_LOG (CSV EXPORT)
// ---------------------------------------------------------------------------
app.get('/api/approval_log', requireLogin, async (req, res) => {
  if (!['admin','supervisor'].includes(req.session.user.role))
    return res.status(403).send('forbidden');

  const rows = await readMasterTracking();

  const csvRows = rows.map(r => ({
    StudentName: r['Student Name'] || '',
    Matric: r['Matric No'] || '',
    P1Approved: r['P1 Approved'] || '',
    P3Approved: r['P3 Approved'] || '',
    P4Approved: r['P4 Approved'] || '',
    P5Approved: r['P5 Approved'] || ''
  }));

  const csv = stringify(csvRows, { header: true });
  res.setHeader('Content-Disposition', 'attachment; filename=approval_log.csv');
  res.setHeader('Content-Type', 'text/csv');
  res.send(csv);
});

// ---------------------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    await getSheets();
    res.json({ status: 'ok' });
  } catch (e) {
    res.json({ status: 'error', message: e.toString() });
  }
});

// ---------------------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
