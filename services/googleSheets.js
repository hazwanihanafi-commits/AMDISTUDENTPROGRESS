// services/googleSheets.js
import { google } from "googleapis";
import { buildTimeline } from "../helpers/timeline.js";
import { calcProgress } from "../helpers/progress.js";

/**
 * Google Sheets Auth Helper
 */
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

/**
 * Read MasterTracking sheet
 */
export async function readMasterTracking(spreadsheetId) {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "MasterTracking!A1:Z2000"
  });

  const rows = res.data.values;
  if (!rows || rows.length < 2) return [];

  const header = rows[0].map(h => h.trim());
  const data = rows.slice(1);

  const students = data.map(row => {
    const obj = {};

    // Build row -> object mapping
    header.forEach((col, i) => {
      obj[col] = row[i] || "";
    });

    // Format student object based on your exact sheet headers
    const student = {
      matric: obj["Matric"] || "",
      name: obj["Student Name"] || "",
      programme: obj["Programme"] || "",
      startDate: obj["Start Date"] || "",
      supervisorEmail: obj["Main Supervisor's Email"] || "",
      studentEmail: obj["Student's Email"] || "",

      p1Submitted: !!obj["P1 Submitted"],
      p1Approved: !!obj["P1 Approved"],
      p3Submitted: !!obj["P3 Submitted"],
      p3Approved: !!obj["P3 Approved"],
      p4Submitted: !!obj["P4 Submitted"],
      p4Approved: !!obj["P4 Approved"],
      p5Submitted: !!obj["P5 Submitted"],
      p5Approved: !!obj["P5 Approved"]
    };

    // Detect programme type
    const isPhD = student.programme.toLowerCase().includes("philosophy");

    // Correct durations (you confirmed: PhD = 3 yr, MSc = 2 yr)
    const expectedMonths = isPhD
      ? { P1: 0, P3: 3, P4: 6, P5: 36 }  // PhD = 3 years
      : { P1: 0, P3: 3, P4: 6, P5: 24 }; // MSc = 2 years

    // Build timeline
    student.timeline = buildTimeline(student, expectedMonths);

    // Progress percentage from 0–100
    student.progress = calcProgress(student);

    return student;
  });

  return students;
}
