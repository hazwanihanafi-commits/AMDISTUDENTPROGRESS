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

export async function readMasterTracking(spreadsheetId) {
  const rows = await readRange(spreadsheetId, "MasterTracking!A1:Z1000");

  if (!rows.length) return [];

  const header = rows[0].map((h) => h.trim());
  const data = rows.slice(1);

  const students = data.map((row) => {
    const s = {};
    header.forEach((h, i) => (s[h] = row[i] || ""));

    // Normalized fields
    const mapped = {
      matric: s["Matric"] || s["Matric No"] || "",
      name: s["Student Name"] || "",
      programme: s["Programme"] || "",
      startDate: s["Start Date"] || "",

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

    // Determine MSc or PhD
    const isPhD =
      mapped.programme &&
      mapped.programme.toLowerCase().includes("philosophy");

    // Expected duration logic
    const expectedMonths = isPhD
      ? { P1: 0, P3: 3, P4: 6, P5: 24 } // PhD = 3 years max, P5 by month 24
      : { P1: 0, P3: 3, P4: 6, P5: 12 }; // MSc = 2 years max, P5 by month 12

    // Build expected timeline
    mapped.timeline = buildTimeline(
      {
        startDate: mapped.startDate,

        p1Submitted: mapped.p1Submitted,
        p1Approved: mapped.p1Approved,
        p3Submitted: mapped.p3Submitted,
        p3Approved: mapped.p3Approved,
        p4Submitted: mapped.p4Submitted,
        p4Approved: mapped.p4Approved,
        p5Submitted: mapped.p5Submitted,
        p5Approved: mapped.p5Approved,
      },
      expectedMonths
    );

    // Compute progress % & level
    mapped.progress = calcProgress(mapped);

    return mapped;
  });

  return students;
}
