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

const COL = {
  MATRIC: 1,
  NAME: 2,
  PROGRAMME: 3,
  YEAR: 4,
  P1_SUB: 5,
  P1_APP: 6,
  P3_SUB: 7,
  P3_APP: 8,
  P4_SUB: 9,
  P4_APP: 10,
  P5_SUB: 11,
  P5_APP: 12,
  LAST: 13,
  STATUS: 14,
};

function calculateOverallStatus(row) {
  const P1 = row[COL.P1_SUB - 1];
  const P3 = row[COL.P3_SUB - 1];
  const P4 = row[COL.P4_SUB - 1];
  const P5 = row[COL.P5_SUB - 1];

  if (!P1) return "Not Started";
  if (P1 && !P3) return "P1 Completed";
  if (P1 && P3 && !P4) return "P3 Completed";
  if (P1 && P3 && P4 && !P5) return "P4 Completed";
  if (P1 && P3 && P4 && P5) return "All Completed";
  return "In Progress";
}

async function getSheetsClient() {
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

async function fetchAllRows() {
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
  const rows = await fetchAllRows();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[COL.MATRIC - 1] || "").trim() === String(matric).trim()) {
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
      const newRow = new Array(14).fill("");
      newRow[COL.MATRIC - 1] = matric;
      newRow[COL.NAME - 1] = studentName || "";
      if (body.programme) newRow[COL.PROGRAMME - 1] = body.programme;
      if (body.year) newRow[COL.YEAR - 1] = body.year;

      if (stage === "P1") newRow[COL.P1_SUB - 1] = timestamp;
      if (stage === "P3") newRow[COL.P3_SUB - 1] = timestamp;
      if (stage === "P4") newRow[COL.P4_SUB - 1] = timestamp;
      if (stage === "P5") newRow[COL.P5_SUB - 1] = timestamp;

      newRow[COL.LAST - 1] = timestamp;
      newRow[COL.STATUS - 1] = calculateOverallStatus(newRow);

      await appendRow(newRow);
      return res.json({ status: "ok", message: "New row appended" });
    } else {
      const sheets = await getSheetsClient();
      const read = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A${sheetRowIndex}:N${sheetRowIndex}`,
      });
      const current = read.data.values && read.data.values[0] ? read.data.values[0] : new Array(14).fill("");

      if (stage === "P1") current[COL.P1_SUB - 1] = timestamp;
      if (stage === "P3") current[COL.P3_SUB - 1] = timestamp;
      if (stage === "P4") current[COL.P4_SUB - 1] = timestamp;
      if (stage === "P5") current[COL.P5_SUB - 1] = timestamp;

      current[COL.NAME - 1] = studentName || current[COL.NAME - 1];
      if (body.programme) current[COL.PROGRAMME - 1] = body.programme;
      if (body.year) current[COL.YEAR - 1] = body.year;

      current[COL.LAST - 1] = timestamp;
      current[COL.STATUS - 1] = calculateOverallStatus(current);

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
    if (stage === "P1") row[COL.P1_APP - 1] = ts;
    if (stage === "P3") row[COL.P3_APP - 1] = ts;
    if (stage === "P4") row[COL.P4_APP - 1] = ts;
    if (stage === "P5") row[COL.P5_APP - 1] = ts;

    row[COL.LAST - 1] = ts;
    row[COL.STATUS - 1] = calculateOverallStatus(row);

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
      matric: r[COL.MATRIC - 1] || "",
      name: r[COL.NAME - 1] || "",
      programme: r[COL.PROGRAMME - 1] || "",
      year: r[COL.YEAR - 1] || "",
      milestones: {
        P1: r[COL.P1_SUB - 1] || "",
        P1Approved: r[COL.P1_APP - 1] || "",
        P3: r[COL.P3_SUB - 1] || "",
        P3Approved: r[COL.P3_APP - 1] || "",
        P4: r[COL.P4_SUB - 1] || "",
        P4Approved: r[COL.P4_APP - 1] || "",
        P5: r[COL.P5_SUB - 1] || "",
        P5Approved: r[COL.P5_APP - 1] || "",
      },
      lastUpdate: r[COL.LAST - 1] || "",
      overall: r[COL.STATUS - 1] || "",
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
      if (r[COL.P1_SUB - 1]) totals.P1++;
      if (r[COL.P3_SUB - 1]) totals.P3++;
      if (r[COL.P4_SUB - 1]) totals.P4++;
      if (r[COL.P5_SUB - 1]) totals.P5++;
      if (r[COL.STATUS - 1] === "All Completed") totals.completed++;
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
