// server.js (ESM) - CLEAN + WORKING
import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

import timelineRoutes from './routes/timeline.js';
import statusRoutes from './routes/status.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --------------------------------------------------------
// Middleware
// --------------------------------------------------------
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'replace_me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

app.use(express.static(path.join(__dirname, 'public')));

// --------------------------------------------------------
// Google Sheets Helper
// --------------------------------------------------------
async function getSheetsClient() {
  if (!process.env.SERVICE_ACCOUNT_JSON)
    throw new Error('SERVICE_ACCOUNT_JSON missing');

  const creds = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);

  const jwt = new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  await jwt.authorize();
  return google.sheets({ version: 'v4', auth: jwt });
}

async function readMasterTrackingRows() {
  const sheets = await getSheetsClient();
  const id = process.env.SHEET_ID;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: 'MasterTracking!A1:Z2000'
  });
  return res.data.values || [];
}

// --------------------------------------------------------
// LOGIN
// --------------------------------------------------------
app.post('/login', async (req, res) => {
  try {
    const emailIn = (req.body.email || '').trim().toLowerCase();
    if (!emailIn) return res.status(400).json({ status: 'error', message: 'Email required' });

    // Admin check
    const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
    if (emailIn === ADMIN_EMAIL) {
      req.session.user = { email: emailIn, role: 'admin' };
      return res.json({ status: 'ok', role: 'admin' });
    }

    // Find from MasterTracking
    const rows = await readMasterTrackingRows();
    const headers = rows[0].map(h => (h || '').toString().trim());

    const studentEmailIdx = headers.findIndex(h => /student.*email/i.test(h));
    const supervisorEmailIdx = headers.findIndex(h => /supervisor.*email/i.test(h));

    let role = null;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (studentEmailIdx !== -1 && (r[studentEmailIdx] || '').toLowerCase() === emailIn) {
        role = 'student';
        break;
      }
      if (supervisorEmailIdx !== -1 && (r[supervisorEmailIdx] || '').toLowerCase() === emailIn) {
        role = 'supervisor';
        break;
      }
    }

    if (!role)
      return res.status(403).json({ status: 'error', message: 'Email not registered' });

    req.session.user = { email: emailIn, role };
    res.json({ status: 'ok', role });

  } catch (err) {
    console.error('login err', err);
    res.status(500).json({ status: 'error', message: err.toString() });
  }
});

// --------------------------------------------------------
// LOGOUT
// --------------------------------------------------------
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

// --------------------------------------------------------
// AUTH GUARD
// --------------------------------------------------------
function requireLogin(req, res, next) {
  if (req.session?.user) return next();
  return res.redirect('/login.html');
}

// Dashboard routes
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

// --------------------------------------------------------
// API ROUTES
// --------------------------------------------------------
app.use('/api', timelineRoutes);
app.use('/api', statusRoutes);

// --------------------------------------------------------
// HEALTH
// --------------------------------------------------------
app.get('/health', async (req, res) => {
  try {
    await getSheetsClient();
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.toString() });
  }
});

// --------------------------------------------------------
// START SERVER
// --------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
