// services/googleSheets.js
import { google } from "googleapis";
import { buildTimeline } from "../helpers/buildTimeline.js";
import { calcProgress } from "../helpers/progress.js";
import { groupActivities } from "../helpers/activityMap.js";

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth: await auth.getClient() });
}

export async function readRange(spreadsheetId, range) {
  const client = await getSheetsClient();
  const res = await client.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

// Treat any non-empty cell as a flag (System B)
function flagCell(val) {
  return val !== undefined && val !== null && String(val).trim() !== "";
}

export async function readMasterTracking(spreadsheetId) {
  const rows = await readRange(spreadsheetId, "MasterTracking!A1:Z2000");
  if (!rows || !rows.length) return [];

  const headers = rows[0].map(h => (h || "").trim());
  const dataRows = rows.slice(1);

  const students = dataRows.map(row => {
    const rowObj = {};
    headers.forEach((h, i) => rowObj[h] = row[i] || "");

    // normalize matric
    const matric = (rowObj["Matric"] || rowObj["Matric No"] || rowObj["MatricNo"] || "").toString().trim();

    // Determine programme
    const programme = (rowObj["Programme"] || "").toString().trim();

    // Start date (keep as string but try parsing if possible)
    const startRaw = rowObj["Start Date"] || rowObj["StartDate"] || "";
    const startDate = startRaw ? new Date(startRaw) : new Date();

    // Read P flags as raw strings (System B)
    const mapped = {
      matric,
      name: rowObj["Student Name"] || rowObj["Name"] || "",
      programme,
      startDate,

      // keep flags as original string or boolean; buildTimeline will use truthiness
      p1Submitted: rowObj["P1 Submitted"] || "",
      p1Approved: rowObj["P1 Approved"] || "",
      p3Submitted: rowObj["P3 Submitted"] || "",
      p3Approved: rowObj["P3 Approved"] || "",
      p4Submitted: rowObj["P4 Submitted"] || "",
      p4Approved: rowObj["P4 Approved"] || "",
      p5Submitted: rowObj["P5 Submitted"] || "",
      p5Approved: rowObj["P5 Approved"] || "",

      supervisorEmail: rowObj["Main Supervisor's Email"] || "",
      studentEmail: rowObj["Student's Email"] || "",
      // optionally a column that lists activities (comma separated)
      activitiesRaw: rowObj["Activity"] || rowObj["Milestone"] || ""
    };

    // Decide MSc vs PhD: check keyword 'Philosophy' or 'Doctor'
    const isPhD = /(philosophy|doctor|phd)/i.test(mapped.programme);

    const expectedMonths = isPhD
      ? { P1: 0, P3: 3, P4: 6, P5: 24 }
      : { P1: 0, P3: 3, P4: 6, P5: 12 };

    // Build timeline (System B expects flags not dates)
    mapped.timeline = buildTimeline(mapped, expectedMonths);

    // Compute progress expects boolean flags — convert truthy -> true
    mapped.p1Submitted = !!mapped.p1Submitted;
    mapped.p1Approved  = !!mapped.p1Approved;
    mapped.p3Submitted = !!mapped.p3Submitted;
    mapped.p3Approved  = !!mapped.p3Approved;
    mapped.p4Submitted = !!mapped.p4Submitted;
    mapped.p4Approved  = !!mapped.p4Approved;
    mapped.p5Submitted = !!mapped.p5Submitted;
    mapped.p5Approved  = !!mapped.p5Approved;

    mapped.progress = calcProgress(mapped);

    // Process activities: if sheet contains comma-separated activities, split and group
    let activities = [];
    if (mapped.activitiesRaw && String(mapped.activitiesRaw).trim()) {
      activities = String(mapped.activitiesRaw).split(",").map(s => s.trim()).filter(Boolean);
    }
    mapped.activitiesGrouped = groupActivities(activities);

    return mapped;
  });

  return students;
}
