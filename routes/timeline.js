// routes/timeline.js
import express from 'express';
import fs from 'fs';

// ⭐ Shared Google Sheets helper
import {
  getSheetsClientFromEnv,
  findExistingTab,
  readSheetRows,
  writeCell
} from './_helpers/googleSheets.js';

const router = express.Router();

// Candidate tabs
const TAB_CANDIDATES = ['MasterTracking', 'Form responses', 'Form responses 1', 'Sheet1'];

// Start date header candidates
const START_DATE_KEYS = [
  'Start Date', 'StartDate', 'Start',
  'Registration Date', 'Timestamp'
];

// Default activity list (fallback)
const DEFAULT_ACTIVITIES = [
  'Registration & Orientation',
  'Literature Review & Proposal Preparation',
  'Proposal Defence',
  'Research Ethics Approval (JEPeM)',
  'Research Implementation I',
  'Mid-Candidature Review',
  'Research Communication I',
  'Research Implementation II',
  'Publication I',
  'Research Dissemination',
  'Thesis Preparation',
  'Pre-Submission Review (JPMPMP)',
  'Thesis Examination & Completion'
];

// Convert index → A1 letter
function colToLetter(col) {
  let s = '';
  while (col >= 0) {
    s = String.fromCharCode((col % 26) + 65) + s;
    col = Math.floor(col / 26) - 1;
  }
  return s;
}

// Date parsing
function parseDateFlexible(s) {
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d)) return d;

  const m = String(s).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const dd = parseInt(m[1],10), mm = parseInt(m[2],10)-1, yy = parseInt(m[3],10);
    return new Date(yy < 100 ? 2000 + yy : yy, mm, dd);
  }

  return null;
}

// Compute quarter groups Y1Q1–Y3Q4
function computeQuartersFromStart(startDate, years=3) {
  const q = [];
  let cursor = new Date(startDate);

  for (let y = 1; y <= years; y++) {
    for (let qu = 1; qu <= 4; qu++) {
      const start = new Date(cursor);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 3);

      q.push({
        key: `Y${y}Q${qu}`,
        start: start.toISOString(),
        end: end.toISOString()
      });

      cursor = new Date(end);
    }
  }

  return q;
}

// Load activities (if mapping file exists)
function loadActivitiesFromMapping(type) {
  try {
    const file = type === 'phd'
      ? '/tmp/timeline_mapping_phd.json'
      : '/tmp/timeline_mapping_msc.json';

    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.mapping) return data.mapping.map(x => x.activity);
      if (data.activities) return data.activities;
    }
  } catch (e) {}

  return DEFAULT_ACTIVITIES;
}

//
// ====================================================================
//  GET /api/timeline
// ====================================================================
//
router.get('/timeline', async (req, res) => {
  try {
    const matric = (req.query.matric || '').trim();
    const template = (req.query.template || 'm').toLowerCase() === 'p'
      ? 'phd'
      : 'msc';

    if (!matric)
      return res.status(400).json({ status:'error', message:'missing matric' });

    const sheets = await getSheetsClientFromEnv();
    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId)
      return res.status(500).json({ status:'error', message:'SHEET_ID missing' });

    const tab = await findExistingTab(sheets, spreadsheetId);
    const rows = await readSheetRows(sheets, spreadsheetId, tab);
    if (!rows.length)
      return res.status(500).json({ status:'error', message:'sheet empty' });

    const headers = rows[0].map(h => (h || '').trim());

    // Find matric column
    let mIdx = headers.findIndex(h => ['Matric','Matric No','MatricNo'].includes(h));
    if (mIdx === -1)
      mIdx = headers.findIndex(h => /matric/i.test(h));

    if (mIdx === -1)
      return res.status(500).json({ status:'error', message:'matric column not found' });

    // Find student row
    let rowIndex = -1;
    let rowObj = {};
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][mIdx] || '').toString().trim() === matric) {
        rowIndex = i;
        headers.forEach((h, ci) => rowObj[h] = rows[i][ci] || '');
        break;
      }
    }

    if (rowIndex === -1)
      return res.status(404).json({ status:'error', message:'student not found' });

    //
    // Get Start Date
    //
    let startDateVal = null;
    let startIdx = -1;
    for (const k of START_DATE_KEYS) {
      startIdx = headers.findIndex(h => h === k);
      if (startIdx !== -1) {
        startDateVal = rows[rowIndex][startIdx];
        break;
      }
    }
    if (!startDateVal) {
      startIdx = headers.findIndex(h => /start/i.test(h));
      if (startIdx !== -1) startDateVal = rows[rowIndex][startIdx];
    }

    const parsedStart = parseDateFlexible(startDateVal) || new Date();

    // Create quarter keys
    const quarters = computeQuartersFromStart(parsedStart, 3);
    const quarterKeys = quarters.map(q => q.key);

    // Load activities
    const activities = loadActivitiesFromMapping(template);

    //
    // Quarter values from sheet
    //
    const values = {};
    quarterKeys.forEach(k => {
      const colIdx = headers.findIndex(h => h === k);
      values[k] = colIdx !== -1 ? (rows[rowIndex][colIdx] || '') : '';
    });

    const activityObjs = activities.map(act => {
      const qTick = {};
      quarterKeys.forEach(k => qTick[k] = !!values[k]);
      return { activity: act, quarterTicks: qTick };
    });

    //
    // Milestones P1,P3,P4,P5
    //
    const milestones = {};
    ['P1','P3','P4','P5'].forEach(stage => {
      const candidates = [
        `${stage} Submitted`, `${stage}Submitted`, `${stage}_Submitted`,
        `${stage} Approved`, `${stage}Approved`
      ];
      milestones[stage] = '';
      for (const c of candidates) {
        const idx = headers.findIndex(h => h === c);
        if (idx !== -1) {
          milestones[stage] = rows[rowIndex][idx] || '';
          break;
        }
      }
    });

    return res.json({
      status: 'ok',
      matric,
      studentName: rowObj['Student Name'] || rowObj['Name'] || '',
      lastUpdate: rowObj['Last Update'] || '',
      startDate: parsedStart.toISOString(),
      quarterKeys,
      quarterRanges: quarters,
      activities: activityObjs,
      milestones,
      header: headers
    });

  } catch (err) {
    console.error('GET /timeline error:', err);
    return res.status(500).json({ status:'error', message: err.toString() });
  }
});

//
// ====================================================================
//  POST /api/update_timeline
// ====================================================================
//
router.post('/update_timeline', async (req, res) => {
  try {
    const { matric, column, value } = req.body;
    if (!matric || !column)
      return res.status(400).json({ status:'error', message:'missing params' });

    const sheets = await getSheetsClientFromEnv();
    const spreadsheetId = process.env.SHEET_ID;

    const tab = await findExistingTab(sheets, spreadsheetId);
    const rows = await readSheetRows(sheets, spreadsheetId, tab);
    const headers = rows[0].map(h => (h || '').trim());

    // Ensure column exists
    let colIdx = headers.findIndex(h => h === column);

    if (colIdx === -1) {
      headers.push(column);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        resource: { values: [headers] }
      });
      colIdx = headers.length - 1;
    }

    // Find matric row
    let mIdx = headers.findIndex(h => /matric/i.test(h));
    let rowNum = -1;
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][mIdx] || '').toString().trim() === matric)
        rowNum = i + 1;
    }

    if (rowNum === -1)
      return res.status(404).json({ status:'error', message:'student not found' });

    const colLetter = colToLetter(colIdx);
    await writeCell(sheets, spreadsheetId, tab, `${colLetter}${rowNum}`, value || '');

    return res.json({ status:'ok', updated: { matric, column, value } });

  } catch (err) {
    console.error('POST /update_timeline error:', err);
    return res.status(500).json({ status:'error', message: err.toString() });
  }
});

export default router;
