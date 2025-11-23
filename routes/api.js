// routes/api.js (ESM version)
import express from 'express';
import { readRange, writeRange } from '../services/googleSheets.js';
import { driveUploadFromUrl, ensureRootFolder } from '../services/googleDrive.js';

const router = express.Router();
const SHEET_ID = process.env.SHEET_ID;

/* --------------------------------------------------
   GET /api/status?matric=
-------------------------------------------------- */
router.get('/status', async (req, res) => {
  try {
    const matric = (req.query.matric || '').trim();
    if (!matric) {
      return res.status(400).json({ status: 'error', message: 'missing matric' });
    }

    // Read sheet
    const rows = await readRange(SHEET_ID, 'MasterTracking!A1:Z10000');
    const header = rows[0] || [];
    const data = rows.slice(1);

    // Column indexes
    const idx = header.indexOf('Matric');
    const nameIdx = header.indexOf('Student Name');  // ✔ matches sheet
    const lastIdx = header.indexOf('Last Update');

    // Match student row
    const found = data.find(r => String(r[idx] || '') === matric);
    if (!found) return res.json({ status: 'not_found' });

    // Milestones
    const milestones = {
      P1: found[header.indexOf('P1 Submitted')] || '',
      P1Approved: found[header.indexOf('P1 Approved')] || '',
      P3: found[header.indexOf('P3 Submitted')] || '',
      P3Approved: found[header.indexOf('P3 Approved')] || '',
      P4: found[header.indexOf('P4 Submitted')] || '',
      P4Approved: found[header.indexOf('P4 Approved')] || '',
      P5: found[header.indexOf('P5 Submitted')] || '',
      P5Approved: found[header.indexOf('P5 Approved')] || ''
    };

    // Response
    res.json({
      status: 'ok',
      matric,
      studentName: found[nameIdx],  // ✔ FIXED (no space)
      lastUpdate: found[lastIdx],
      milestones
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.toString() });
  }
});


/* --------------------------------------------------
   GET /api/dashboardData
-------------------------------------------------- */
router.get('/dashboardData', async (req, res) => {
  try {
    const rows = await readRange(SHEET_ID, 'MasterTracking!A1:Z10000');
    const header = rows[0] || [];
    const data = rows.slice(1);

    const totals = { total: data.length, P1: 0, P3: 0, P4: 0, P5: 0, completed: 0 };

    data.forEach(r => {
      if (r[header.indexOf('P1 Submitted')]) totals.P1++;
      if (r[header.indexOf('P3 Submitted')]) totals.P3++;
      if (r[header.indexOf('P4 Submitted')]) totals.P4++;
      if (r[header.indexOf('P5 Submitted')]) totals.P5++;
      if (r[header.indexOf('Overall Status')] === 'All Completed') totals.completed++;
    });

    res.json({ status: 'ok', totals });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.toString() });
  }
});


/* --------------------------------------------------
   POST /api/approve
-------------------------------------------------- */
router.post('/approve', async (req, res) => {
  try {
    const matric = req.body.matric || req.query.matric;
    const stage = req.body.stage || req.query.stage;
    const pass = req.body._svpass || req.query._svpass || '';

    if (!matric || !stage)
      return res.status(400).json({ status: 'error', message: 'missing params' });

    const SV_PASS = process.env.SUPERVISOR_PASS || '';
    if (SV_PASS && pass !== SV_PASS)
      return res.status(403).json({ status: 'error', message: 'not authorized' });

    // Load sheet
    const rows = await readRange(SHEET_ID, 'MasterTracking!A1:Z10000');
    const header = rows[0] || [];
    const data = rows.slice(1);

    // Identify student row
    const idx = header.indexOf('Matric');
    const rowIdx = data.findIndex(r => String(r[idx] || '') === String(matric));
    if (rowIdx === -1)
      return res.status(404).json({ status: 'error', message: 'student not found' });

    const sheetRowNumber = rowIdx + 2;

    // Map which column to update
    const colNameMap = {
      P1: 'P1 Approved',
      P3: 'P3 Approved',
      P4: 'P4 Approved',
      P5: 'P5 Approved'
    };

    const colName = colNameMap[stage];
    if (!colName)
      return res.status(400).json({ status: 'error', message: 'invalid stage' });

    const colIndex = header.indexOf(colName);
    const colLetter = String.fromCharCode('A'.charCodeAt(0) + colIndex);

    // Write approval timestamp
    const range = `MasterTracking!${colLetter}${sheetRowNumber}`;
    await writeRange(SHEET_ID, range, [[ new Date().toISOString() ]]);

    // Log entry
    await writeRange(SHEET_ID, 'Approval_Log!A1', null, {
      appendRow: true,
      values: [[ new Date().toISOString(), 'approval', matric, '', stage, '', 'render-api' ]]
    });

    res.json({ status: 'ok', message: `Approved ${stage} for ${matric}` });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.toString() });
  }
});

export default router;
