// routes/timeline.js (ESM)
import express from 'express';
import { readRange, writeRange } from '../services/googleSheets.js';

const router = express.Router();
const SHEET_ID = process.env.SHEET_ID;
const SV_PASS = process.env.SUPERVISOR_PASS || '';

/**
 * Helper: find header index by exact or fuzzy match
 */
function findHeaderIndex(header, names) {
  for (const name of names) {
    const idx = header.findIndex(h => String(h||'').trim().toLowerCase() === String(name||'').trim().toLowerCase());
    if (idx !== -1) return idx;
  }
  // fuzzy: contains
  for (let i=0;i<header.length;i++){
    const h = String(header[i]||'').toLowerCase();
    for (const name of names) if (name && h.includes(String(name).toLowerCase())) return i;
  }
  return -1;
}

/**
 * GET /api/timeline?matric=...&template=m|p
 * returns:
 * { status:'ok', template:'m', matric:'...', studentName:'', lastUpdate:'', activities: [ { activity, stage, stageValue, quarterTicks: {Y1Q1: true,...} } ], milestones: {P1:'',P3:'',P4:'',P5:''} }
 */
router.get('/timeline', async (req, res) => {
  try {
    const matric = String(req.query.matric || '').trim();
    if (!matric) return res.status(400).json({ status:'error', message:'missing matric' });

    // read sheet
    const rows = await readRange(SHEET_ID, 'MasterTracking!A1:Z10000');
    const header = rows[0] || [];
    const data = rows.slice(1);

    const matIdx = findHeaderIndex(header, ['Matric','matric','Matric No','MatricNo']);
    const nameIdx = findHeaderIndex(header, ['StudentName','Student Name','Name']);
    const lastIdx = findHeaderIndex(header, ['Last Update','LastUpdate','Timestamp']);

    const row = data.find(r => String((r[matIdx]||'')).trim() === String(matric).trim());
    if (!row) return res.json({ status:'not_found' });

    // build base milestones
    const milestones = {
      P1: row[findHeaderIndex(header, ['P1 Submitted','P1'])] || '',
      P1Approved: row[findHeaderIndex(header, ['P1 Approved','P1Approved'])] || '',
      P3: row[findHeaderIndex(header, ['P3 Submitted','P3'])] || '',
      P3Approved: row[findHeaderIndex(header, ['P3 Approved','P3Approved'])] || '',
      P4: row[findHeaderIndex(header, ['P4 Submitted','P4'])] || '',
      P4Approved: row[findHeaderIndex(header, ['P4 Approved','P4Approved'])] || '',
      P5: row[findHeaderIndex(header, ['P5 Submitted','P5'])] || '',
      P5Approved: row[findHeaderIndex(header, ['P5 Approved','P5Approved'])] || ''
    };

    // choose template mapping (m = MSc, p = PhD)
    const template = (req.query.template || 'm').toLowerCase() === 'p' ? 'phd' : 'msc';

    // default activities order (will be replaced by migration-driven mapping if present in sheet)
    const activities = [
      "Registration & Orientation",
      "Literature Review & Proposal Preparation",
      "Proposal Defence",
      "Research Ethics Approval (JEPeM)",
      "Research Implementation I",
      "Mid-Candidature Review",
      "Research Communication I",
      "Research Implementation II",
      "Publication I",
      "Research Dissemination",
      "Thesis Preparation",
      "Pre-Submission Review (JPMPMP)",
      "Thesis Examination & Completion"
    ];

    // mapping stage per activity (P1,P3,P4,P5)
    const ACT_TO_STAGE = {
      "Registration & Orientation":"P1",
      "Literature Review & Proposal Preparation":"P1",
      "Proposal Defence":"P1",
      "Research Ethics Approval (JEPeM)":"P1",
      "Research Implementation I":"P3",
      "Mid-Candidature Review":"P3",
      "Research Communication I":"P3",
      "Research Implementation II":"P4",
      "Publication I":"P4",
      "Research Dissemination":"P4",
      "Thesis Preparation":"P4",
      "Pre-Submission Review (JPMPMP)":"P5",
      "Thesis Examination & Completion":"P5"
    };

    // Attempt to detect quarter columns for each activity by scanning header names (e.g., "Year 1 Q1" or activity + "Q1")
    // Build quarterTicks for each activity using any header columns that match pattern
    const quarterKeys = []; // e.g., ['Y1Q1','Y1Q2',...]
    // Try to build quarter list from header by searching for "Q1", "Q2", "Q3", "Q4" substrings
    for (const h of header) {
      const hh = String(h||'');
      if (hh.match(/q[1-4]/i) || hh.match(/year\s*\d/i)) {
        // try standardize to Y#Q#
        const qmatch = hh.match(/(y(?:ear)?\s*([0-9]))?.*(q[1-4])/i);
        if (qmatch) {
          const y = qmatch[2] || '1';
          const q = qmatch[3].toUpperCase();
          const key = `Y${y}${q.toUpperCase()}`;
          if (!quarterKeys.includes(key)) quarterKeys.push(key);
        } else {
          // fallback: if contains Q1..Q4
          const q = hh.match(/(q[1-4])/i);
          if (q) {
            const key = `Q_${q[1].toUpperCase()}`; if (!quarterKeys.includes(key)) quarterKeys.push(key);
          }
        }
      }
    }

    // build activity objects; if no quarterKeys found, quarterTicks will be empty and UI will use stage flags (P1/P3/P4/P5)
    const resultActivities = activities.map(act=>{
      const stage = ACT_TO_STAGE[act] || '';
      // stage value pulled from milestones
      const stageVal = milestones[stage] || '';
      // build quarterTicks by looking for header columns that contain activity words + Q1/Q2...
      const quarterTicks = {};
      for (const h of header) {
        const hLower = String(h||'').toLowerCase();
        if (hLower.includes(act.split(' ')[0].toLowerCase()) || hLower.includes(act.split(' ')[1]?.toLowerCase() || '')) {
          // if header also contains q1/q2 etc, map it
          const q = hLower.match(/q[1-4]/i);
          const y = hLower.match(/y(?:ear)?\s*([0-9])/i);
          if (q) {
            const key = `Y${y ? y[1] : 1}${q[0].toUpperCase()}`;
            const idx = header.indexOf(h);
            quarterTicks[key] = Boolean(row[idx] && String(row[idx]).trim() !== '');
          }
        }
      }
      return { activity:act, stage, stageValue: stageVal, quarterTicks };
    });

    res.json({
      status: 'ok',
      template,
      matric,
      studentName: row[nameIdx] || '',
      lastUpdate: row[lastIdx] || '',
      milestones,
      activities: resultActivities,
      quarterKeys
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status:'error', message: err.toString() });
  }
});

/**
 * POST /api/update_timeline
 * body: { matric, updates: [ { columnName, value } ], _svpass }
 * Protected by supervisor pass (if set)
 */
router.post('/update_timeline', async (req, res) => {
  try {
    const pass = req.body._svpass || '';
    if (SV_PASS && pass !== SV_PASS) return res.status(403).json({ status:'error', message:'not authorized' });

    const matric = req.body.matric;
    const updates = req.body.updates || [];
    if (!matric || !Array.isArray(updates)) return res.status(400).json({ status:'error', message:'missing params' });

    const rows = await readRange(SHEET_ID, 'MasterTracking!A1:Z10000');
    const header = rows[0] || [];
    const data = rows.slice(1);
    const matIdx = header.findIndex(h => String(h||'').toLowerCase().includes('matric'));
    const rowIdx = data.findIndex(r => String(r[matIdx]||'') === String(matric));
    if (rowIdx === -1) return res.status(404).json({ status:'error', message:'student not found' });

    const sheetRowNumber = rowIdx + 2;

    // For each update, find header index and write
    for (const u of updates) {
      const colIndex = header.findIndex(h => String(h||'').trim().toLowerCase() === String(u.columnName||'').trim().toLowerCase());
      if (colIndex === -1) {
        console.warn('Column not found:', u.columnName);
        continue;
      }
      const a1col = String.fromCharCode('A'.charCodeAt(0) + colIndex);
      const range = `MasterTracking!${a1col}${sheetRowNumber}`;
      await writeRange(SHEET_ID, range, [[u.value]]);
    }

    res.json({ status:'ok', message:'updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status:'error', message: err.toString() });
  }
});

export default router;
