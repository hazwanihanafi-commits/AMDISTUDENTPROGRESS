// services/googleSheets.js
import { google } from "googleapis";
import { buildTimeline } from "../helpers/timeline.js";
import { calcProgress } from "../helpers/progress.js";

/**
 * Authenticate Google Sheets
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
 * Read full MasterTracking sheet and return structured student objects
 */
export async function readMasterTracking(spreadsheetId) {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "MasterTracking!A1:Z1000"
  });

  const rows = res.data.values;
  if (!rows || rows.length < 2) return [];

  const header = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);

  const students = dataRows.map(row => {
    const obj = {};

    // Build raw object from row
    header.forEach((col, i) => {
      obj[col] = row[i] || "";
    });

    // Student object
    const student = {
      matric: obj["Matric"] || obj["Matric No"] || "",
      name: obj["Student Name"] || "",
      programme: obj["Programme"] || "",
      startDate: obj["Start Date"] || "",
      supervisorEmail: obj["Main Supervisor's Email"] || "",
      studentEmail: obj["Student's Email"] || "",

      // Submission/approval boolean flags
      p1Submitted: !!obj["P1 Submitted"],
      p1Approved: !!obj["P1 Approved"],
      p3Submitted: !!obj["P3 Submitted"],
      p3Approved: !!obj["P3 Approved"],
      p4Submitted: !!obj["P4 Submitted"],
      p4Approved: !!obj["P4 Approved"],
      p5Submitted: !!obj["P5 Submitted"],
      p5Approved: !!obj["P5 Approved"]
    };

    // Detect MSc vs PhD
    const isPhD = student.programme.toLowerCase().includes("philosophy");

    // Expected timing (corrected)
    const expectedMonths = isPhD
      ? { P1: 0, P3: 3, P4: 6, P5: 36 }  // PhD = 3 years
      : { P1: 0, P3: 3, P4: 6, P5: 24 }; // MSc = 2 years

    // Build timeline (expected + actual)
    student.timeline = buildTimeline(student, expectedMonths);

    // Progress percentage (0–100%)
    student.progress = calcProgress(student);

    return student;
  });

  return students;
}
