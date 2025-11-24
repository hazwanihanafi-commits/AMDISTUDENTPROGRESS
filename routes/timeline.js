// routes/timeline.js
import express from 'express';
import { google } from 'googleapis';
import fs from 'fs';

const router = express.Router();

// Config: tab priorities
const TAB_CANDIDATES = ['MasterTracking', 'Form responses', 'Form responses 1', 'Sheet1'];

// Start date candidate headers
const START_DATE_KEYS = ['Start Date','StartDate','Start','Registration Date','Timestamp'];

// Default activities fallback
const DEFAULT_ACTIVITIES = [
  'Registration & Orientation','Literature Review & Proposal Preparation','Proposal Defence',
  'Research Ethics Approval (JEPeM)','Research Implementation I','Mid-Candidature Review',
  'Research Communication I','Research Implementation II','Publication I','Research Dissemination',
  'Thesis Preparation','Pre-Submission Review (JPMPMP)','Thesis Examination & Completion'
];

async function getSheetsClientFromEnv() {
  if (!process.env.SERVICE_ACCOUNT_JSON) throw new Error('SERVICE_ACCOUNT_JSON env missing');
  const creds = typeof process.env.SERVICE_ACCOUNT_JSON === 'string'
    ? JSON.parse(process.env.SERVICE_ACCOUNT_JSON)
    : process.env.SERVICE_ACCOUNT_JSON;
  const jwt = new google.auth.JWT(
    creds.client_email, null, creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  await jwt.authorize();
  return google.sheets({ version: 'v4', auth: jwt });
}

async function findExistingTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const names = (meta.data.sheets || []).map(s => s.properties.title);
  for (const t of TAB_CANDIDATES) if (names.includes(t)) return t;
  return names[0];
}

async function readSheetRows(sheets, spreadsheetId, tabName) {
  const range = `${tabName}!A1:Z3000`;
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return resp.data.values || [];
}

async function writeCell(sheets, spreadsheetId, tabName, a1Range, value) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!${a1Range}`,
    valueInputOption: 'RAW',
    resource: { values: [[value]] }
  });
}

function colToLetter(col) {
  let s = '';
  while (col >= 0) {
    s = String.fromCharCode((col % 26) + 65) + s;
    col = Math.floor(col / 26) - 1;
  }
  return s;
}

function computeQuartersFromStart(startDate, years = 3) {
  const quarters = [];
  let cursor = new Date(startDate);
  for (let y = 1; y <= years; y++) {
    for (let q = 1; q <= 4; q++) {
      const start = new Date(cursor);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 3);
      const key = `Y${y}Q${q}`;
      quarters.push({ key, start: start.toISOString(), end: end.toISOString() });
      cursor = new Date(end);
    }
  }
  return quarters;
}

function parseDateFlexible(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  const m = String(s).trim().match(/^(\d{1,2})[\/\-\s](\d{1,2})[\/\-\s](\d{2,4})$/);
  if (m) {
    const dd = parseInt(m[1],10), mm = parseInt(m[2],10)-1, yy = parseInt(m[3],10);
    return new Date(yy < 100 ? 2000 + yy : yy, mm, dd);
  }
  return null;
}

function loadActivitiesFromMapping(type) {
  try {
    const p = type === 'phd'
      ? '/tmp/timeline_mapping_phd.json'
      : '/tmp/timeline_mapping_msc.json';
    if (fs.existsSync(p)) {
      const js = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (js.mapping && js.mapping.length) return js.mapping.map(m => m.activity);
      if (js.activities && js.activities.length) return js.activities;
    }
  } catch (e) {
    console.warn('mapping load fail', e && e.toString());
  }
  return DEFAULT_ACTIVITIES;
}

/* GET /api/timeline?matric=...&template=(m|p) */
router.get('/timeline', async (req, res) => {
  try {
    const matric = (req.query.matric || '').toString().trim();
    const tmpl = ((req.query.template || 'm').toString().toLowerCase() === 'p') ? 'phd' : 'msc';
    if (!matric) return res.status(400).json({ status:'error', message:'missing matric' });

    const sheets = await getSheetsClientFromEnv();
    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) return res.status(500).json({ status:'error', message:'SHEET_ID missing' });

    const tab = await findExistingTab(sheets, spreadsheetId);
    const rows = await readSheetRows(sheets, spreadsheetId, tab);
    if (!rows.length) return res.status(500).json({ status:'error', message:'sheet empty' });

    const headers = rows[0].map(h => (h||'').toString().trim());
    const matricCols = ['Matric','Matric No','MatricNo','StudentID','ID'];
    let mIdx = headers.findIndex(h => matricCols.includes(h));
    if (mIdx === -1) mIdx = headers.findIndex(h => /matric/i.test(h));
    if (mIdx === -1) return res.status(500).json({ status:'error', message:'matric column not found' });

    let rowObj = null;
    let rowNumber = -1;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if ((r[mIdx] || '').toString().trim() === matric.toString()) {
        rowNumber = i+1;
        rowObj = {};
        headers.forEach((h, ci) => (rowObj[h] = r[ci] || ''));
        break;
      }
    }
    if (!rowObj) return res.status(404).json({ status:'error', message:'student not found' });

    let startDateVal = null;
    for (const k of START_DATE_KEYS) {
      const idx = headers.findIndex(h => (h||'').toString().trim() === k);
      if (idx !== -1) { startDateVal = rows[rowNumber-1][idx]; break; }
    }
    if (!startDateVal) {
      const idx2 = headers.findIndex(h => /start/i.test(h));
      if (idx2 !== -1) startDateVal = rows[rowNumber-1][idx2];
    }

    const parsedStart = parseDateFlexible(startDateVal) || new Date();
    const quarterRanges = computeQuartersFromStart(parsedStart, 3);
    const quarterKeys = quarterRanges.map(q=> q.key);

    const activities = loadActivitiesFromMapping(tmpl);

    // Read current values for quarter columns if these columns exist
    const values = {};
    quarterKeys.forEach(k => {
      const idx = headers.findIndex(h => (h||'').toString().trim() === k);
      values[k] = idx !== -1 ? (rows[rowNumber-1][idx] || '') : '';
    });

    const activityObjs = activities.map(act => {
      const quarterTicks = {};
      quarterKeys.forEach(k => { quarterTicks[k] = !!values[k]; });
      return { activity: act, quarterTicks, stageValue: '' };
    });

    const milestones = {};
    ['P1','P3','P4','P5'].forEach(s => {
      const possible = [`${s} Submitted`, `${s}Submitted`, `${s}_Submitted`, `${s} Approved`, `${s}Approved`];
      for (const p of possible) {
        const idx = headers.findIndex(h => (h||'').toString().trim() === p);
        if (idx !== -1) { milestones[s] = rows[rowNumber-1][idx] || ''; break; }
      }
      if (!milestones[s]) milestones[s] = '';
    });

    // ---------------------------
    // AUTO-ADD missing quarter columns (IMPORTANT)
    // ---------------------------
    async function ensureQuarterColumns() {
      const missing = [];
      quarterKeys.forEach(k => {
        const idx = headers.findIndex(h => h === k);
        if (idx === -1) missing.push(k);
      });
      if (!missing.length) return;

      const newHeaders = [...headers, ...missing];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: "RAW",
        resource: { values: [newHeaders] }
      });
      console.log("[TIMELINE] Added quarter columns:", missing.join(", "));
      // update 'headers' in-memory so we can return consistent info
      headers.push(...missing);
    }

    await ensureQuarterColumns();

    return res.json({
      status: 'ok',
      matric,
      studentName: rowObj['Student Name'] || rowObj['StudentName'] || rowObj['Name'] || '',
      lastUpdate: rowObj['Last Update'] || rowObj['Timestamp'] || '',
      startDate: parsedStart.toISOString(),
      quarterRanges,
      quarterKeys,
      activities: activityObjs,
      milestones,
      header: headers,
      rawRow: rowObj
    });

  } catch (err) {
    console.error('timeline err', err);
    return res.status(500).json({ status:'error', message: err && err.toString ? err.toString() : String(err) });
  }
});

/* POST /api/update_timeline */
router.post('/update_timeline', async (req, res) => {
  try {
    const { matric, column, value } = req.body || {};
    if (!matric || !column) return res.status(400).json({ status:'error', message:'missing params' });

    const sheets = await getSheetsClientFromEnv();
    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) return res.status(500).json({ status:'error', message:'SHEET_ID missing' });

    const tab = await findExistingTab(sheets, spreadsheetId);
    const rows = await readSheetRows(sheets, spreadsheetId, tab);
    if (!rows.length) return res.status(500).json({ status:'error', message:'sheet empty' });

    const headers = rows[0].map(h => (h||'').toString().trim());
    let colIndex = headers.findIndex(h => h === column);

    if (colIndex === -1) {
      headers.push(column);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        resource: { values: [headers] }
      });
      colIndex = headers.length - 1;
    }

    const matricCols = ['Matric','Matric No','MatricNo','StudentID','ID'];
    let mIdx = headers.findIndex(h => matricCols.includes(h));
    if (mIdx === -1) mIdx = headers.findIndex(h => /matric/i.test(h));
    if (mIdx === -1) return res.status(500).json({ status:'error', message:'matric column not found' });

    let rowNumber = -1;
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][mIdx] || '').toString().trim() === matric.toString()) { rowNumber = i+1; break; }
    }
    if (rowNumber === -1) return res.status(404).json({ status:'error', message:'student not found' });

    const colLetter = colToLetter(colIndex);
    await writeCell(sheets, spreadsheetId, tab, `${colLetter}${rowNumber}`, value || '');

    return res.json({ status:'ok', matric, column, value });

  } catch (err) {
    console.error('update_timeline err', err);
    return res.status(500).json({ status:'error', message: err && err.toString ? err.toString() : String(err) });
  }
});

export default router;
