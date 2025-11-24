// services/googleSheets.js
import { google } from "googleapis";
import { calcProgress } from "../helpers/progress.js";
import { buildTimeline } from "../helpers/timeline.js";

// Authenticate Google Sheets
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

/* -------------------------------------------------------
   BASIC READ FUNCTION (used in many parts of your app)
------------------------------------------------------- */
export async function readRange(spreadsheetId, range) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return res.data.values || [];
}

/* -------------------------------------------------------
   BASIC WRITE FUNCTION
------------------------------------------------------- */
export async function writeRange(spreadsheetId, range, values, options = {}) {
  const sheets = await getSheetsClient();

  if (options.appendRow) {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: options.values }
    });
    return res.data;
  }

  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });

  return res.data;
}

/* -------------------------------------------------------
   READ MASTER TRACKING (the important one)
------------------------------------------------------- */
export async function readMasterTracking(spreadsheetId, range = "MasterTracking!A1:Z1000") {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = res.data.values || [];
  if (!rows.length) return [];

  const header = rows[0].map((h) => h.trim());
  const data = rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = r[i] || "";
    });
    return obj;
  });

  const students = data.map((row) => {
    const s = {
      matric: row["Matric"] || row["Matric No"] || "",
      name: row["Student Name"] || row["Name"] || "",
      programme: row["Programme"] || "",
      startDate: row["Start Date"] || row["StartDate"] || "",
      // Submitted/Approved
      p1Submitted: !!row["P1 Submitted"],
      p1Approved: !!row["P1 Approved"],
      p3Submitted: !!row["P3 Submitted"],
      p3Approved: !!row["P3 Approved"],
      p4Submitted: !!row["P4 Submitted"],
      p4Approved: !!row["P4 Approved"],
      p5Submitted: !!row["P5 Submitted"],
      p5Approved: !!row["P5 Approved"],
      supervisorEmail: row["Main Supervisor's Email"] || row["Supervisor Email"] || "",
      studentEmail: row["Student's Email"] || row["Student Email"] || "",
    };

    // Calculate progress
    s.progress = calcProgress(s);

    // Build timeline
    const isPhD = s.programme.toLowerCase().includes("philosophy");
    s.timeline = buildTimeline(s, {
      P1: 0,
      P3: 3,
      P4: 6,
      P5: isPhD ? 24 : 12,
    });

    return s;
  });

  return students;
}
