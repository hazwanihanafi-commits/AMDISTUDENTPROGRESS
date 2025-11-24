// server.js (ESM FIXED FULL LOGIN)
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

// Serve static UI files
app.use(express.static(path.join(__dirname, 'public')));

// ===== GOOGLE SHEETS AUTH =====
async function getSheets() {
  if (!process.env.SERVICE_ACCOUNT_JSON) {
    throw new Error("SERVICE_ACCOUNT_JSON missing");
  }

  const creds = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);

  const jwt = new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );

  await jwt.authorize();
  return google.sheets({ version: "v4", auth: jwt });
}

async function readSheet() {
  const sheets = await getSheets();
  const id = process.env.SHEET_ID;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: "MasterTracking!A1:Z2000"
  });

  return res.data.values;
}

// ========== LOGIN ROUTE (THIS WAS MISSING) ==========
app.post("/login", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    if (!email) return res.json({ status: "error", message: "Email required" });

    const rows = await readSheet();
    const headers = rows[0];

    const emailIndex = headers.findIndex(
      h => h.toLowerCase() === "student's email" ||
           h.toLowerCase() === "student email" ||
           h.toLowerCase() === "email"
    );

    const supervisorIndex = headers.findIndex(
      h => h.toLowerCase().includes("supervisor") &&
           h.toLowerCase().includes("email")
    );

    let role = null;

    // ADMIN
    if (email === (process.env.ADMIN_EMAIL || "").toLowerCase()) {
      role = "admin";
    }

    // SUPERVISOR
    if (!role) {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][supervisorIndex]?.toLowerCase() === email) {
          role = "supervisor";
          break;
        }
      }
    }

    // STUDENT
    if (!role) {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][emailIndex]?.toLowerCase() === email) {
          role = "student";
          break;
        }
      }
    }

    if (!role) {
      return res.json({ status: "error", message: "Email not found in system" });
    }

    // Save session
    req.session.user = {
      email,
      role
    };

    return res.json({ status: "ok", role });

  } catch (err) {
    return res.json({ status: "error", message: err.toString() });
  }
});

// ========== PROTECTED DASHBOARD ROUTES ==========
function requireLogin(req, res, next) {
  if (req.session.user) return next();
  return res.redirect("/login.html");
}

app.get("/student", requireLogin, (req, res) => {
  if (req.session.user.role !== "student") return res.redirect("/login.html");
  res.sendFile(path.join(__dirname, "public", "dashboard-student.html"));
});

app.get("/supervisor", requireLogin, (req, res) => {
  if (req.session.user.role !== "supervisor") return res.redirect("/login.html");
  res.sendFile(path.join(__dirname, "public", "dashboard-supervisor.html"));
});

app.get("/admin", requireLogin, (req, res) => {
  if (req.session.user.role !== "admin") return res.redirect("/login.html");
  res.sendFile(path.join(__dirname, "public", "dashboard-admin.html"));
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login.html"));
});

// API ROUTES
app.use('/api', timelineRoutes);

// Health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
