// server.js (ESM) - full, ready-to-deploy
import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import timelineRoutes from './routes/timeline.js';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'replace_me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------- Google Sheets helper ----------------------
async function getSheetsClient() {
  if (!process.env.SERVICE_ACCOUNT_JSON) throw new Error('SERVICE_ACCOUNT_JSON missing');
  const creds = typeof process.env.SERVICE_ACCOUNT_JSON === 'string'
    ? JSON.parse(process.env.SERVICE_ACCOUNT_JSON)
    : process.env.SERVICE_ACCOUNT_JSON;
  const jwt = new google.auth.JWT(
    creds.client_email, null, creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  await jwt.authorize();
  return google.sheets({ version: 'v4', auth: jwt });
}

async function readMasterTrackingRows() {
  const sheets = await getSheetsClient();
  const id = process.env.SHEET_ID;
  if (!id) throw new Error('SHEET_ID missing');
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: 'MasterTracking!A1:Z2000' });
  return res.data.values || [];
}

// ---------------------- LOGIN ROUTE (was missing) ----------------------
app.post('/login', async (req, res) => {
  try {
    const emailIn = (req.body.email || '').toString().trim().toLowerCase();
    if (!emailIn) return res.status(400).json({ status:'error', message:'Email required' });

    // Admin fast check
    const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toString().toLowerCase();
    if (ADMIN_EMAIL && emailIn === ADMIN_EMAIL) {
      req.session.user = { email: emailIn, role: 'admin' };
      return res.json({ status:'ok', role:'admin' });
    }

    // optionally auto-admin any @usm.my (uncomment if you prefer)
    // if (emailIn.endsWith('@usm.my')) { req.session.user = { email: emailIn, role: 'admin' }; return res.json({status:'ok',role:'admin'}); }

    // search sheet for student or supervisor
    const rows = await readMasterTrackingRows();
    if (!rows.length) return res.status(500).json({ status:'error', message:'MasterTracking empty' });
    const headers = rows[0].map(h => (h||'').toString().trim());

    // common header names
    const studentEmailIdx = headers.findIndex(h => /student.*email|email/i.test(h));
    const supervisorEmailIdx = headers.findIndex(h => /supervisor.*email|main supervisor/i.test(h));

    let role = null;
    // scan for match
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (studentEmailIdx !== -1 && (r[studentEmailIdx]||'').toString().trim().toLowerCase() === emailIn) {
        role = 'student';
        break;
      }
      if (supervisorEmailIdx !== -1 && (r[supervisorEmailIdx]||'').toString().trim().toLowerCase() === emailIn) {
        role = 'supervisor';
        break;
      }
    }

    if (!role) return res.status(403).json({ status:'error', message:'Email not registered' });

    req.session.user = { email: emailIn, role };
    return res.json({ status:'ok', role });
  } catch (err) {
    console.error('login err', err);
    return res.status(500).json({ status:'error', message: err.toString() });
  }
});

// simple logout
app.get('/logout', (req,res) => { req.session.destroy(()=>res.redirect('/login.html')); });

// require login middleware
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.xhr || req.headers.accept.indexOf('application/json') > -1) return res.status(401).json({status:'error',message:'Not authenticated'});
  return res.redirect('/login.html');
}

// protected pages
app.get('/student', requireLogin, (req,res) => {
  if (!req.session.user || req.session.user.role !== 'student') return res.redirect('/login.html');
  return res.sendFile(path.join(__dirname, 'public', 'dashboard-student.html'));
});
app.get('/supervisor', requireLogin, (req,res) => {
  if (!req.session.user || req.session.user.role !== 'supervisor') return res.redirect('/login.html');
  return res.sendFile(path.join(__dirname, 'public', 'dashboard-supervisor.html'));
});
app.get('/admin', requireLogin, (req,res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/login.html');
  return res.sendFile(path.join(__dirname, 'public', 'dashboard-admin.html'));
});

// mount timeline API
app.use('/api', timelineRoutes);

// health
app.get('/health', async (req,res) => {
  try { await getSheetsClient(); res.json({status:'ok'}); }
  catch(e) { res.status(500).json({status:'error', message: e.toString()}); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
