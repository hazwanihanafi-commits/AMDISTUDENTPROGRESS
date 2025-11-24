// services/googleSheets.js
import { google } from "googleapis";
import { buildTimeline } from "../helpers/buildTimeline.js";
import { calcProgress } from "../helpers/progress.js";

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth: await auth.getClient() });
}

export async function readRange(spreadsheetId, range) {
  const client = await getSheetsClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return res.data.values || [];
}

// Convert Google serial date → JS date
function parseDate(value) {
  if (!value) return null;

  // Case 1: Already string date
  if (typeof value === "string" && value.includes("/")) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  // Case 2: Google serial number (e.g. 44500)
  if (!isNaN(value)) {
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + value * 86400000);
  }

  return null;
}

export async function readMasterTracking(spreadsheetId) {
  const rows = await readRange(spreadsheetId, "MasterTracking!A1:Z1000");

  if (!rows.length) return [];

  const header = rows[0].map((h) => h.trim());
  const data = rows.slice(1);

  const students = data.map((row) => {
    const s = {};
    header.forEach((h, i) => (s[h] = row[i] || ""));

    const startDateConverted = parseDate(s["Start Date"]);

    const mapped = {
      matric: s["Matric"] || "",
      name: s["Student Name"] || "",
      programme: s["Programme"] || "",
      startDate: startDateConverted, // FIXED

      p1Submitted: !!s["P1 Submitted"],
      p1Approved: !!s["P1 Approved"],
      p3Submitted: !!s["P3 Submitted"],
      p3Approved: !!s["P3 Approved"],
      p4Submitted: !!s["P4 Submitted"],
      p4Approved: !!s["P4 Approved"],
      p5Submitted: !!s["P5 Submitted"],
      p5Approved: !!s["P5 Approved"],

      supervisorEmail: s["Main Supervisor's Email"] || "",
      studentEmail: s["Student's Email"] || "",
    };

    const isPhD =
      mapped.programme &&
      mapped.programme.toLowerCase().includes("philosophy");

    const expectedMonths = isPhD
      ? { P1: 0, P3: 3, P4: 6, P5: 24 }
      : { P1: 0, P3: 3, P4: 6, P5: 12 };

    mapped.timeline = buildTimeline(mapped, expectedMonths);
    mapped.progress = calcProgress(mapped);

    return mapped;
  });

  return students;
}
