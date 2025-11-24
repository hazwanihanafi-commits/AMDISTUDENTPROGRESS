// routes/timeline.js
// ESM module for timeline API: GET /api/timeline and POST /api/update_timeline
import express from 'express';
import { google } from 'googleapis';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Config: try these tab names in order
const TAB_CANDIDATES = ['MasterTracking', 'Form responses', 'Form responses 1', 'Sheet1'];

// Try these start date column names
const START_DATE_KEYS = ['Start Date','StartDate','Start','Registration Date','Timestamp'];

// Default activity list fallback (if templates/mapping missing)
const DEFAULT_ACTIVITIES = [
  'Registration & Orientation','Literature Review & Proposal Preparation','Proposal Defence',
  'Research Ethics Approval (JEPeM)','Research Implementation I','Mid-Candidature Review',
  'Research Communication I','Research Implementation II','Publication I','Research Dissemination',
  'Thesis Preparation','Pre-Submission Review (JPMPMP)','Thesis Examination & Completion'
];

// Helper to get auth'd Google Sheets client
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

// Helper: find which tab exists
async function findExistingTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const names = (meta.data.sheets || []).map(s => s.properties.title);
  for (const t of TAB_CANDIDATES) if (names.includes(t)) return t;
  // fallback to first sheet
  return names[0];
}

// Helper: read whole sheet (A1:Z2000)
async function readSheetRows(sheets, spreadsheetId, tabName) {
  const range = `${tabName}!A1:Z2000`;
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return resp.data.values || [];
}

// Helper: write single cell (A1 notation)
async function writeCell(sheets, spreadsheetId, tabName, a1Range, value) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!${a1Range}`,
    valueInputOption: 'RAW',
    resource: { values: [[value]] }
  });
}

// Convert column index (0-based) to letter (A,B,...,Z,AA,...)
function colToLetter(col) {
  let s = '';
  while (col >= 0) {
    s = String.fromCharCode((col % 26) + 65) + s;
    col = Math.floor(col / 26) - 1;
  }
  return s;
}

// compute quarter ranges from startDate (Date object)
// returns array of { key: 'Y1Q1', start: ISO, end: ISO }
function computeQuartersFromStart(startDate, years = 3) {
  // quarters are 3-month periods; we'll treat Q1 as startDate .. startDate+3mo
  const quarters = [];
  let cursor = new Date(startDate);
  for (let y = 1; y <= years; y++) {
    for (let q = 1; q <= 4; q++) {
      const start = new Date(cursor);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 3);
      const key = `Y${y}Q${q}`;
      quarters.push({ key, start: start.toISOString(), end: end.toISOString() });
      // advance cursor to end
      cursor = new Date(end);
    }
  }
  return quarters;
}

// try to parse a date from various formats
function parseDateFlexible(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  // if already ISO-like
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  // try dd/mm/yyyy or dd-mm-yyyy
  const m = String(s).trim().match(/^(\d{1,2})[\/\-\s](\d{1,2})[\/\-\s](\d{2,4})$/);
  if (m) {
    const dd = parseInt(m[1],10), mm = parseInt(m[2],10)-1, yy = parseInt(m[3],10);
    return new Date(yy < 100 ? 2000 + yy : yy, mm, dd);
  }
  return null;
}

// try to extract activities from template mapping file in /tmp if present
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

/**
 * GET /api/timeline?matric=...&template=(m|p)
 * Returns student row + dynamic quarterRanges + activities + values for each quarter key
 */
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
    // find matric column
    const matricCols = ['Matric','Matric No','MatricNo','StudentID','ID'];
    let mIdx = headers.findIndex(h => matricCols.includes(h));
    if (mIdx === -1) {
      // fallback to first col named Matric-like
      mIdx = headers.findIndex(h => /matric/i.test(h));
    }
    if (mIdx === -1) return res.status(500).json({ status:'error', message:'matric column not found' });

    // find student row
    let rowObj = null;
    let rowNumber = -1;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if ((r[mIdx] || '').toString().trim() === matric.toString()) {
        rowNumber = i+1; // 1-based sheet rows
        // build object
        rowObj = {};
        headers.forEach((h, ci) => (rowObj[h] = r[ci] || ''));
        break;
      }
    }
    if (!rowObj) return res.status(404).json({ status:'error', message:'student not found' });

    // find start date
    let startDateVal = null;
    let startColIndex = -1;
    for (const k of START_DATE_KEYS) {
      const idx = headers.findIndex(h => (h||'').toString().trim() === k);
      if (idx !== -1) { startColIndex = idx; startDateVal = rows[rowNumber-1][idx]; break; }
    }
    // fallback search by fuzzy header contains "start"
    if (!startDateVal) {
      const idx2 = headers.findIndex(h => /start/i.test(h));
      if (idx2 !== -1) { startColIndex = idx2; startDateVal = rows[rowNumber-1][idx2]; }
    }

    const parsedStart = parseDateFlexible(startDateVal) || new Date();

    // compute quarterRanges
    const quarterRanges = computeQuartersFromStart(parsedStart, 3); // 3 years

    // Quarter keys to check in sheet headers (we expect Y1Q1..Y3Q4 columns to exist)
    const quarterKeys = quarterRanges.map(q=> q.key);

    // load activities (from mapping file if present)
    const activities = loadActivitiesFromMapping(tmpl);

    // Read current values for quarter columns if these columns exist
    const values = {}; // { 'Y1Q1': '✓' or '' ... }
    quarterKeys.forEach(k => {
      const idx = headers.findIndex(h => (h||'').toString().trim() === k);
      values[k] = idx !== -1 ? (rows[rowNumber-1][idx] || '') : '';
    });

    // Build activity objects: for now we return activities + quarterTicks derived from sheet values
    const activityObjs = activities.map(act => {
      const quarterTicks = {};
      quarterKeys.forEach(k => { quarterTicks[k] = !!values[k]; });
      return { activity: act, quarterTicks, stageValue: '' }; // stageValue can be set from P1..P5 columns if needed
    });

    // Collect milestones P1..P5 values if available
    const milestones = {};
    ['P1','P3','P4','P5'].forEach(s => {
      const possible = [`${s} Submitted`, `${s}Submitted`, `${s}_Submitted`, `${s} Approved`, `${s}Approved`];
      for (const p of possible) {
        const idx = headers.findIndex(h => (h||'').toString().trim() === p);
        if (idx !== -1) { milestones[s] = rows[rowNumber-1][idx] || ''; break; }
      }
      if (!milestones[s]) milestones[s] = '';
    });

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

/**
 * POST /api/update_timeline
 * body { matric, column: 'Y1Q1', value: '✓' or '' }
 * writes the value into the cell for that student under the column. If the column does not exist, it appends it.
 */
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
    // If column doesn't exist, append it to end
    if (colIndex === -1) {
      headers.push(column);
      // update header row (A1)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        resource: { values: [headers] }
      });
      colIndex = headers.length - 1;
    }

    // find matric column & row index
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
    // write value into the cell
    await writeCell(sheets, spreadsheetId, tab, `${colLetter}${rowNumber}`, value || '');

    return res.json({ status:'ok', matric, column, value });

  } catch (err) {
    console.error('update_timeline err', err);
    return res.status(500).json({ status:'error', message: err && err.toString ? err.toString() : String(err) });
  }
});

export default router;
