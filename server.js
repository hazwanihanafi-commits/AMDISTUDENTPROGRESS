// server.js — FULLY FIXED ESM VERSION

import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import cors from 'cors';
import { google } from 'googleapis';
import path from 'path';
import csvStringify from 'csv-stringify/lib/sync.js';
import apiTimelineRoutes from './routes/timeline.js';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// FIX __dirname FOR ES MODULES
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CREATE APP FIRST (IMPORTANT! app MUST exist before app.use())
// ---------------------------------------------------------------------------
const app = express();        // <--- DO THIS BEFORE USING app.use()

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
// ROUTES (NOW SAFE TO LOAD)
// ---------------------------------------------------------------------------
app.use('/api', apiTimelineRoutes);     // <--- FIXED (this must be AFTER app creation)

// ---------------------------------------------------------------------------
// ENVIRONMENT VARIABLES
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

  if (!SERVICE_ACCOUNT_JSON) {
    throw new Error('Missing SERVICE_ACCOUNT_JSON');
  }

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
// AUTH + ROLE HANDLING (UNMODIFIED FROM YOUR CODE)
// ---------------------------------------------------------------------------
async function getUserRole(email) {
  if (!email) return { role: null };
  const rows = await readMasterTracking();

  const studentEmailFields = ['Student Email', 'Email'];
  const supervisorEmailFields = ['Supervisor Email'];

  // ADMIN CHECK
  if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return { role: 'admin', details: { email } };
  }

  // SUPERVISOR CHECK
  const supMatches = rows.filter(r =>
    supervisorEmailFields.some(k => (r[k] || '').toLowerCase() === email.toLowerCase())
  );

  if (supMatches.length > 0) {
    return {
      role: 'supervisor',
      details: {
        email,
        students: supMatches.map(r => ({
          name: r['Student Name'],
          matric: r['Matric No'],
          row: r
        }))
      }
    };
  }

  // STUDENT CHECK
  const stuMatches = rows.filter(r =>
    studentEmailFields.some(k => (r[k] || '').toLowerCase() === email.toLowerCase())
  );

  if (stuMatches.length > 0) {
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
// HEALTH CHECK
// ---------------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    await getSheets();
    res.json({ status: 'ok' });
  } catch (err) {
    res.json({ status: 'error', message: err.toString() });
  }
});

// ---------------------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
