// server.js (ESM) - ready to deploy
import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import timelineRoutes from './routes/timeline.js';
import statusRoutes from './routes/status.js';

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

// API routes
app.use('/api', timelineRoutes);
app.use('/api', statusRoutes);

// Simple login endpoint (reads MasterTracking and sets session role)
app.post('/login', async (req, res) => {
  try {
    const emailIn = (req.body.email || '').toString().trim().toLowerCase();
    if (!emailIn) return res.status(400).json({ status:'error', message:'Email required' });

    // ADMIN fast-check using env ADMIN_EMAIL
    const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toString().toLowerCase();
    if (ADMIN_EMAIL && emailIn === ADMIN_EMAIL) {
      req.session.user = { email: emailIn, role: 'admin' };
      return res.json({ status:'ok', role:'admin' });
    }

    // fallback: check sheet to see whether this email matches student or supervisor
    // call status route helper via internal function
    const { getSheetsClientFromEnv } = await import('./routes/_helpers/googleSheets.js');
    const sheets = await getSheetsClientFromEnv();
    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) return res.status(500).json({ status:'error', message:'SHEET_ID missing' });
    const tabMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabName = (tabMeta.data.sheets && tabMeta.data.sheets[0] && tabMeta.data.sheets[0].properties.title) || 'Sheet1';
    const range = `${tabName}!A1:Z2000`;
    const rowsRes = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = rowsRes.data.values || [];
    if (!rows.length) return res.status(500).json({ status:'error', message:'MasterTracking empty' });
    const headers = rows[0].map(h => (h||'').toString().trim());
    const studentEmailIdx = headers.findIndex(h => /student.*email|email/i.test(h));
    const supervisorEmailIdx = headers.findIndex(h => /supervisor.*email|main supervisor/i.test(h));

    let foundRole = null;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (studentEmailIdx !== -1 && (r[studentEmailIdx] || '').toString().trim().toLowerCase() === emailIn) {
        foundRole = 'student'; break;
      }
      if (supervisorEmailIdx !== -1 && (r[supervisorEmailIdx] || '').toString().trim().toLowerCase() === emailIn) {
        foundRole = 'supervisor'; break;
      }
    }

    if (!foundRole) return res.status(403).json({ status:'error', message:'Email not registered' });
    req.session.user = { email: emailIn, role: foundRole };
    return res.json({ status:'ok', role: foundRole });

  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ status:'error', message: err && err.toString ? err.toString() : String(err) });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
