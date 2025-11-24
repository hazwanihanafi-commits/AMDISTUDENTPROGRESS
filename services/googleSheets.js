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

// case-insensitive header search
function findHeaderIndex(headers, candidates = []) {
  const normalized = headers.map(h => (h || "").toString().trim().toLowerCase());
  for (const c of candidates) {
    const idx = normalized.indexOf(String(c).trim().toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

// tolerant date parse for dd/mm/yyyy or JS parsable dates
function parseStartDate(raw) {
  if (!raw) return new Date();
  // if already Date-like string
  const s = String(raw).trim();
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length === 3) {
      // assume dd/mm/yyyy
      let [d, m, y] = parts;
      d = parseInt(d,10); m = parseInt(m,10)-1; y = parseInt(y,10);
      if (y < 100) y += 2000;
      const dt = new Date(y, m, d);
      if (!isNaN(dt.getTime())) return dt;
    }
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? new Date() : dt;
}

export async function readMasterTracking(spreadsheetId) {
  const rows = await readRange(spreadsheetId, "MasterTracking!A1:Z2000");
  if (!rows || rows.length < 1) return [];

  const headers = rows[0].map(h => (h || "").toString().trim());
  const dataRows = rows.slice(1);

  // find indexes (robust)
  const idx = (candidates) => findHeaderIndex(headers, candidates);

  const idxMatric = idx(['Matric','Matric No','MatricNo','Matric Number','matric']);
  const idxName = idx(['Student Name','Name','student name']);
  const idxProgramme = idx(['Programme','Program','programme']);
  const idxStart = idx(['Start Date','StartDate','Start','Registration Date','Timestamp']);

  const idxP1Sub = idx(['P1 Submitted','P1Submitted','P1 Sub']);
  const idxP1App = idx(['P1 Approved','P1Approved','P1 App']);
  const idxP3Sub = idx(['P3 Submitted','P3Submitted']);
  const idxP3App = idx(['P3 Approved','P3Approved']);
  const idxP4Sub = idx(['P4 Submitted','P4Submitted']);
  const idxP4App = idx(['P4 Approved','P4Approved']);
  const idxP5Sub = idx(['P5 Submitted','P5Submitted']);
  const idxP5App = idx(['P5 Approved','P5Approved']);

  const idxSupervisor = idx(["Main Supervisor's Email","Supervisor Email","Supervisor","Main Supervisor"]);
  const idxStudentEmail = idx(["Student's Email","Student Email","Email","student email"]);
  const idxActivities = idx(['Activity','Activities','Milestone','Activity List']);

  const students = dataRows.map((row) => {
    const col = i => (i >= 0 ? (row[i] || "").toString().trim() : "");

    const matric = col(idxMatric);
    const name = col(idxName);
    const programme = col(idxProgramme);
    const startDate = parseStartDate(col(idxStart));

    const rawP1Sub = col(idxP1Sub);
    const rawP1App = col(idxP1App);
    const rawP3Sub = col(idxP3Sub);
    const rawP3App = col(idxP3App);
    const rawP4Sub = col(idxP4Sub);
    const rawP4App = col(idxP4App);
    const rawP5Sub = col(idxP5Sub);
    const rawP5App = col(idxP5App);

    const activitiesRaw = col(idxActivities);

    const mapped = {
      matric,
      name,
      programme,
      startDate,

      // keep raw flags — buildTimeline will use truthiness (System B)
      p1Submitted: rawP1Sub || "",
      p1Approved: rawP1App || "",
      p3Submitted: rawP3Sub || "",
      p3Approved: rawP3App || "",
      p4Submitted: rawP4Sub || "",
      p4Approved: rawP4App || "",
      p5Submitted: rawP5Sub || "",
      p5Approved: rawP5App || "",

      supervisorEmail: col(idxSupervisor),
      studentEmail: col(idxStudentEmail),
      activitiesRaw
    };

    const isPhD = /(philosophy|phd|doctor)/i.test(mapped.programme || "");
    const expectedMonths = isPhD ? {P1:0,P3:3,P4:6,P5:24} : {P1:0,P3:3,P4:6,P5:12};

    mapped.timeline = buildTimeline(mapped, expectedMonths);

    // convert flags -> booleans for progress calculation
    mapped.p1Submitted = !!mapped.p1Submitted;
    mapped.p1Approved  = !!mapped.p1Approved;
    mapped.p3Submitted = !!mapped.p3Submitted;
    mapped.p3Approved  = !!mapped.p3Approved;
    mapped.p4Submitted = !!mapped.p4Submitted;
    mapped.p4Approved  = !!mapped.p4Approved;
    mapped.p5Submitted = !!mapped.p5Submitted;
    mapped.p5Approved  = !!mapped.p5Approved;

    mapped.progress = calcProgress(mapped);

    // split activities if comma-separated and group
    let activities = [];
    if (mapped.activitiesRaw && String(mapped.activitiesRaw).trim()) {
      activities = String(mapped.activitiesRaw).split(",").map(s => s.trim()).filter(Boolean);
    }
    mapped.activitiesGrouped = groupActivities(activities);

    return mapped;
  });

  return students;
}
