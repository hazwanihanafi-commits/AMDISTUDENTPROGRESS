import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import { google } from "googleapis";
import path from "path";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (process.env.ALLOWED_ORIGINS === "*" || (process.env.ALLOWED_ORIGINS || "").split(",").includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS policy: origin not allowed"), false);
  },
}));

// Google Sheets auth
const auth = new google.auth.GoogleAuth({
  credentials: {
    type: "service_account",
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || "MasterTracking";

// Legacy fixed mapping (kept as fallback)
const LEGACY_COL = {
  MATRIC: 1, NAME: 2, PROGRAMME: 3, YEAR: 4,
  P1_SUB: 5, P1_APP: 6, P3_SUB: 7, P3_APP: 8,
  P4_SUB: 9, P4_APP: 10, P5_SUB: 11, P5_APP: 12,
  LAST: 13, STATUS: 14
};

// Active mapping (will be built from header row)
let COL = null;

function normalizeHeader(h) {
  if (!h) return "";
  return String(h).trim().toLowerCase().replace(/\s+/g, " ");
}

function buildColMapping(headerRow) {
  // headerRow is array of header cell strings (A1..N1)
  const map = {};
  const normalized = headerRow.map(normalizeHeader);
  const find = (candidates) => {
    for (const cand of candidates) {
      const idx = normalized.indexOf(cand.toLowerCase());
      if (idx !== -1) return idx + 1; // 1-based
    }
    return null;
  };

  map.MATRIC = find(["matric", "matric no", "matricno", "student id"]);
  map.NAME = find(["student name", "studentname", "name"]);
  map.PROGRAMME = find(["programme", "program", "field"]);
  map.YEAR = find(["year", "start date"]);
  map.P1_SUB = find(["p1 submitted", "p1 submitted", "p1"]);
  map.P1_APP = find(["p1 approved", "p1 approved", "p1 approved timestamp"]);
  map.P3_SUB = find(["p3 submitted", "p3"]);
  map.P3_APP = find(["p3 approved", "p3 approved"]);
  map.P4_SUB = find(["p4 submitted", "p4"]);
  map.P4_APP = find(["p4 approved", "p4 approved"]);
  map.P5_SUB = find(["p5 submitted", "p5"]);
  map.P5_APP = find(["p5 approved", "p5 approved"]);
  map.LAST = find(["last update", "last", "last updated", "last update timestamp"]);
  map.STATUS = find(["status", "overall", "overall status"]);

  // If critical columns missing, fallback to legacy layout
  const critical = [map.MATRIC, map.NAME];
  if (critical.some(v => v === null)) {
    console.warn("Header detection failed or incomplete — falling back to legacy column mapping.");
    return { ...LEGACY_COL };
  }
  return map;
}

async function getSheetsClient() {
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

async function detectAndSetColMapping() {
  if (COL) return COL;
  try {
    const sheets = await getSheetsClient();
    const range = `${SHEET_NAME}!A1:N1`;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueRenderOption: "FORMATTED_VALUE",
    });
    const header = (res.data.values && res.data.values[0]) || [];
    COL = buildColMapping(header);
    return COL;
  } catch (err) {
    console.error("detect header error:", err);
    COL = { ...LEGACY_COL };
    return COL;
  }
}

function calculateOverallStatus(row) {
  const get = (idx) => {
    if (!idx) return null;
    return row[idx - 1];
  };
  const P1 = get(COL.P1_SUB);
  const P3 = get(COL.P3_SUB);
  const P4 = get(COL.P4_SUB);
  const P5 = get(COL.P5_SUB);

  if (!P1) return "Not Started";
  if (P1 && !P3) return "P1 Completed";
  if (P1 && P3 && !P4) return "P3 Completed";
  if (P1 && P3 && P4 && !P5) return "P4 Completed";
  if (P1 && P3 && P4 && P5) return "All Completed";
  return "In Progress";
}

async function fetchAllRows() {
  await detectAndSetColMapping();
  const sheets = await getSheetsClient();
  const range = `${SHEET_NAME}!A2:N`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return res.data.values || [];
}

async function appendRow(rowValues) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:N`,
    valueInputOption: "USER_ENTERED",
    resource: { values: [rowValues] },
  });
}

async function updateSheetRow(sheetRowIndex, rowValues) {
  const sheets = await getSheetsClient();
  const range = `${SHEET_NAME}!A${sheetRowIndex}:N${sheetRowIndex}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    resource: { values: [rowValues] },
  });
}

async function findRowIndexByMatric(matric) {
  await detectAndSetColMapping();
  const rows = await fetchAllRows();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const matricCell = COL.MATRIC ? String(row[COL.MATRIC - 1] || "").trim() : "";
    if (matricCell === String(matric).trim()) {
      return i + 2;
    }
  }
  return -1;
}

function nowISO() {
  return new Date().toISOString();
}

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body || {};
    let studentName = body.studentName || body.studentName42 || body.name || body["StudentName"] || "";
    let matric = body.matric || body.matricNo || body.matricNo43 || body.Matric || body["Matric"] || "";
    const stage = (body.submissionstage || body.submissionStage || body.milestonecode71 || "").toString();

    if (!matric || !stage) {
      if (body.data && typeof body.data === "object") {
        const d = body.data;
        studentName = studentName || d.studentName || d.name || d.studentName42;
        matric = matric || d.matric || d.matricNo || d.matricNo43;
      }
    }

    if (!matric || !stage) {
      return res.status(400).json({ status: "error", message: "Missing matric or submission stage." });
    }

    const sheetRowIndex = await findRowIndexByMatric(matric);
    const timestamp = nowISO();

    if (sheetRowIndex === -1) {
      // create new row with size 14 (A..N)
      const newRow = new Array(14).fill("");
      if (COL.MATRIC) newRow[COL.MATRIC - 1] = matric;
      if (COL.NAME) newRow[COL.NAME - 1] = studentName || "";
      if (body.programme && COL.PROGRAMME) newRow[COL.PROGRAMME - 1] = body.programme;
      if (body.year && COL.YEAR) newRow[COL.YEAR - 1] = body.year;

      if (stage === "P1" && COL.P1_SUB) newRow[COL.P1_SUB - 1] = timestamp;
      if (stage === "P3" && COL.P3_SUB) newRow[COL.P3_SUB - 1] = timestamp;
      if (stage === "P4" && COL.P4_SUB) newRow[COL.P4_SUB - 1] = timestamp;
      if (stage === "P5" && COL.P5_SUB) newRow[COL.P5_SUB - 1] = timestamp;

      if (COL.LAST) newRow[COL.LAST - 1] = timestamp;
      if (COL.STATUS) newRow[COL.STATUS - 1] = calculateOverallStatus(newRow);

      await appendRow(newRow);
      return res.json({ status: "ok", message: "New row appended" });
    } else {
      const sheets = await getSheetsClient();
      const read = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A${sheetRowIndex}:N${sheetRowIndex}`,
      });
      const current = read.data.values && read.data.values[0] ? read.data.values[0] : new Array(14).fill("");

      if (stage === "P1" && COL.P1_SUB) current[COL.P1_SUB - 1] = timestamp;
      if (stage === "P3" && COL.P3_SUB) current[COL.P3_SUB - 1] = timestamp;
      if (stage === "P4" && COL.P4_SUB) current[COL.P4_SUB - 1] = timestamp;
      if (stage === "P5" && COL.P5_SUB) current[COL.P5_SUB - 1] = timestamp;

      if (COL.NAME) current[COL.NAME - 1] = studentName || current[COL.NAME - 1];
      if (body.programme && COL.PROGRAMME) current[COL.PROGRAMME - 1] = body.programme;
      if (body.year && COL.YEAR) current[COL.YEAR - 1] = body.year;

      if (COL.LAST) current[COL.LAST - 1] = timestamp;
      if (COL.STATUS) current[COL.STATUS - 1] = calculateOverallStatus(current);

      await updateSheetRow(sheetRowIndex, current);
      return res.json({ status: "ok", message: "Updated existing row" });
    }
  } catch (err) {
    console.error("webhook error:", err);
    return res.status(500).json({ status: "error", message: "Server error" });
  }
});

app.get("/approve", async (req, res) => {
  try {
    const matric = req.query.matric;
    const stage = req.query.stage;
    if (!matric || !stage) return res.status(400).json({ status: "error", message: "Missing matric or stage" });

    const sheetRowIndex = await findRowIndexByMatric(matric);
    if (sheetRowIndex === -1) return res.status(404).json({ status: "error", message: "Student not found" });

    const sheets = await getSheetsClient();
    const read = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${sheetRowIndex}:N${sheetRowIndex}`,
    });
    const row = (read.data.values && read.data.values[0]) || new Array(14).fill("");

    const ts = nowISO();
    if (stage === "P1" && COL.P1_APP) row[COL.P1_APP - 1] = ts;
    if (stage === "P3" && COL.P3_APP) row[COL.P3_APP - 1] = ts;
    if (stage === "P4" && COL.P4_APP) row[COL.P4_APP - 1] = ts;
    if (stage === "P5" && COL.P5_APP) row[COL.P5_APP - 1] = ts;

    if (COL.LAST) row[COL.LAST - 1] = ts;
    if (COL.STATUS) row[COL.STATUS - 1] = calculateOverallStatus(row);

    // If none of the approval columns exist, inform the caller
    if (![COL.P1_APP, COL.P3_APP, COL.P4_APP, COL.P5_APP].some(v => v)) {
      return res.json({ status: "ok", message: "No approval columns in sheet; nothing to write." });
    }

    await updateSheetRow(sheetRowIndex, row);
    return res.json({ status: "ok", message: `Approved ${stage} for ${matric}` });
  } catch (err) {
    console.error("approve error:", err);
    return res.status(500).json({ status: "error", message: "Server error" });
  }
});

app.get("/status", async (req, res) => {
  try {
    const matric = req.query.matric;
    if (!matric) return res.status(400).json({ status: "error", message: "matric missing" });

    const sheetRowIndex = await findRowIndexByMatric(matric);
    if (sheetRowIndex === -1) return res.json({ status: "not_found" });

    const sheets = await getSheetsClient();
    const read = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${sheetRowIndex}:N${sheetRowIndex}`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    const r = read.data.values && read.data.values[0] ? read.data.values[0] : [];
    const response = {
      status: "ok",
      matric: COL.MATRIC ? (r[COL.MATRIC - 1] || "") : "",
      name: COL.NAME ? (r[COL.NAME - 1] || "") : "",
      programme: COL.PROGRAMME ? (r[COL.PROGRAMME - 1] || "") : "",
      year: COL.YEAR ? (r[COL.YEAR - 1] || "") : "",
      milestones: {
        P1: COL.P1_SUB ? (r[COL.P1_SUB - 1] || "") : "",
        P1Approved: COL.P1_APP ? (r[COL.P1_APP - 1] || "") : "",
        P3: COL.P3_SUB ? (r[COL.P3_SUB - 1] || "") : "",
        P3Approved: COL.P3_APP ? (r[COL.P3_APP - 1] || "") : "",
        P4: COL.P4_SUB ? (r[COL.P4_SUB - 1] || "") : "",
        P4Approved: COL.P4_APP ? (r[COL.P4_APP - 1] || "") : "",
        P5: COL.P5_SUB ? (r[COL.P5_SUB - 1] || "") : "",
        P5Approved: COL.P5_APP ? (r[COL.P5_APP - 1] || "") : "",
      },
      lastUpdate: COL.LAST ? (r[COL.LAST - 1] || "") : "",
      overall: COL.STATUS ? (r[COL.STATUS - 1] || "") : "",
    };
    return res.json(response);
  } catch (err) {
    console.error("status error:", err);
    return res.status(500).json({ status: "error", message: "Server error" });
  }
});

app.get("/dashboard", async (req, res) => {
  try {
    const rows = await fetchAllRows();
    const totals = { totalStudents: rows.length, P1: 0, P3: 0, P4: 0, P5: 0, completed: 0 };
    rows.forEach(r => {
      if (COL.P1_SUB && r[COL.P1_SUB - 1]) totals.P1++;
      if (COL.P3_SUB && r[COL.P3_SUB - 1]) totals.P3++;
      if (COL.P4_SUB && r[COL.P4_SUB - 1]) totals.P4++;
      if (COL.P5_SUB && r[COL.P5_SUB - 1]) totals.P5++;
      if (COL.STATUS && r[COL.STATUS - 1] === "All Completed") totals.completed++;
    });
    totals.percentComplete = totals.totalStudents ? Math.round(100 * totals.completed / totals.totalStudents) : 0;
    return res.json({ status: "ok", totals });
  } catch (err) {
    console.error("dashboard error:", err);
    return res.status(500).json({ status: "error", message: "Server error" });
  }
});

app.get("/portal", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "portal.html"));
});

app.get("/", (req, res) => res.send("AMDI API running"));

app.listen(PORT, () => console.log(`AMDI API started on port ${PORT}`));