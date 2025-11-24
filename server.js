// server.js (ESM, clean + working)
import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

// API routes
import timelineRoutes from './routes/timeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'replace_me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API
app.use('/api', timelineRoutes);

// ---------------------- AUTH + LOGIN ----------------------
import { google } from 'googleapis';

async function getSheetsClient() {
  const raw = process.env.SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("No SERVICE_ACCOUNT_JSON");

  const creds = JSON.parse(raw);
  const jwt = new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  await jwt.authorize();
  return google.sheets({ version: "v4", auth: jwt });
}

async function readMasterTracking() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: "MasterTracking!A1:Z2000"
  });
  return res.data.values || [];
}

// LOGIN route (missing in your old server)
app.post('/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) return res.json({ status:'error', message:'Email required' });

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (email === adminEmail) {
    req.session.user = { email, role:'admin' };
    return res.json({ status:'ok', role:'admin' });
  }

  const rows = await readMasterTracking();
  const headers = rows[0].map(h => (h||'').trim());

  const stuIdx = headers.findIndex(h => /student.*email|email/i.test(h));
  const supIdx = headers.findIndex(h => /supervisor.*email|main supervisor/i.test(h));

  let foundRole = null;

  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][stuIdx] || '').toLowerCase() === email) {
      foundRole = 'student';
    }
    if ((rows[i][supIdx] || '').toLowerCase() === email) {
      foundRole = 'supervisor';
    }
  }

  if (!foundRole)
    return res.json({ status:'error', message:'Email not registered' });

  req.session.user = { email, role: foundRole };
  res.json({ status:'ok', role: foundRole });
});

function requireLogin(req, res, next) {
  if (req.session?.user) return next();
  return res.redirect('/login.html');
}

// ---------------------- PROTECTED PAGES ----------------------
app.get('/admin', requireLogin, (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'dashboard-admin.html'));
});

app.get('/supervisor', requireLogin, (req, res) => {
  if (req.session.user.role !== 'supervisor') return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'dashboard-supervisor.html'));
});

app.get('/student', requireLogin, (req, res) => {
  if (req.session.user.role !== 'student') return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'dashboard-student.html'));
});

// -------------------------------------------------------------
app.get('/health', (_, res) => res.json({ status:'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on', PORT));
