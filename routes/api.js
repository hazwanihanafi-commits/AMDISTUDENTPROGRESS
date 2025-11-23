// routes/api.js (ESM Version)
import express from 'express';
import fetch from 'node-fetch';
import { readRange, writeRange } from '../services/googleSheets.js';
import { driveUploadFromUrl, ensureRootFolder, createPdfReport } from '../services/googleDrive.js';

const router = express.Router();
const SHEET_ID = process.env.SHEET_ID;

/* GET /api/status?matric= */
router.get('/status', async (req, res) => {
  try {
    const matric = (req.query.matric || '').trim();
    if (!matric) return res.status(400).json({ status: 'error', message: 'missing matric' });

    const rows = await readRange(SHEET_ID, 'MasterTracking!A1:Z10000');
    const header = rows[0] || [];
    const data = rows.slice(1);

    const idx = header.indexOf('Matric');
    const nameIdx = header.indexOf('StudentName');
    const lastIdx = header.indexOf('Last Update');

    const found = data.find(r => String(r[idx] || '') === matric);
    if (!found) return res.json({ status: 'not_found' });

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

    res.json({
      status: 'ok',
      matric,
      studentName: found[nameIdx],
      lastUpdate: found[lastIdx],
      milestones
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.toString() });
  }
});

/* GET /api/dashboardData */
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

/* POST /api/approve */
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

    const rows = await readRange(SHEET_ID, 'MasterTracking!A1:Z10000');
    const header = rows[0] || [];
    const data = rows.slice(1);

    const idx = header.indexOf('Matric');
    const rowIdx = data.findIndex(r => String(r[idx] || '') === String(matric));
    if (rowIdx === -1)
      return res.status(404).json({ status: 'error', message: 'student not found' });

    const sheetRowNumber = rowIdx + 2;

    const colNameMap = { P1: 'P1 Approved', P3: 'P3 Approved', P4: 'P4 Approved', P5: 'P5 Approved' };
    const colName = colNameMap[stage];

    if (!colName) return res.status(400).json({ status: 'error', message: 'invalid stage' });

    const colIndex = header.indexOf(colName);
    if (colIndex === -1)
      return res.status(500).json({ status: 'error', message: 'sheet missing column ' + colName });

    const colLetter = String.fromCharCode('A'.charCodeAt(0) + colIndex);
    const range = `MasterTracking!${colLetter}${sheetRowNumber}`;

    await writeRange(SHEET_ID, range, [[new Date().toISOString()]]);
    await writeRange(SHEET_ID, 'Approval_Log!A1', null, {
      appendRow: true,
      values: [[new Date().toISOString(), 'approval', matric, '', stage, '', 'render-api']]
    });

    res.json({
      status: 'ok',
      message: `Approved ${stage} for ${matric}`
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.toString() });
  }
});

/* GET /api/approval_log */
router.get('/approval_log', async (req, res) => {
  try {
    const rows = await readRange(SHEET_ID, 'Approval_Log!A1:Z10000');
    const csv = rows
      .map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.header('Content-Type', 'text/csv');
    res.attachment('approval_log.csv');
    res.send(csv);

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.toString() });
  }
});

/* POST /api/webhook (JotForm) */
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload.submissionStage && req.query.submissionStage)
      payload.submissionStage = req.query.submissionStage;

    const matric = payload.matricNo43 || payload.matric || '';
    if (!matric) return res.status(400).json({ status: 'error', message: 'missing matric' });

    const saved = [];

    // Handle file uploads
    for (const k of Object.keys(payload)) {
      const v = payload[k];
      if (!v) continue;

      const urls = String(v)
        .split(',')
        .map(s => s.trim())
        .filter(s => s.startsWith('http'));

      for (const u of urls) {
        try {
          const folderId = await ensureRootFolder(SHEET_ID, process.env.ROOT_FOLDER_ID, matric);
          const file = await driveUploadFromUrl(u, folderId);
          saved.push({ field: k, name: file.name, url: file.webViewLink, id: file.id });
        } catch (err) {
          console.warn('file upload error', err);
        }
      }
    }

    // Sheets record update
    const rows = await readRange(SHEET_ID, 'MasterTracking!A1:Z10000');
    const header = rows[0] || [];
    const data = rows.slice(1);

    const matIdx = header.indexOf('Matric');
    let rIndex = data.findIndex(r => String(r[matIdx] || '') === String(matric));

    const now = new Date().toISOString();

    // New row
    if (rIndex === -1) {
      const row = new Array(header.length).fill('');

      const tsIdx = header.indexOf('Timestamp');
      if (tsIdx !== -1) row[tsIdx] = now;

      const nameIdx = header.indexOf('StudentName');
      if (nameIdx !== -1) row[nameIdx] = payload.studentName42 || payload.fullname || '';

      row[matIdx] = matric;

      await writeRange(SHEET_ID, 'MasterTracking!A1', null, {
        appendRow: true,
        values: [row]
      });

    } else {
      const colMap = {
        P1: 'P1 Submitted',
        P3: 'P3 Submitted',
        P4: 'P4 Submitted',
        P5: 'P5 Submitted'
      };

      const stage = (payload.submissionStage || req.query.submissionStage || '').toUpperCase();
      const colName = colMap[stage];

      if (colName && header.indexOf(colName) !== -1) {
        const cellCol = header.indexOf(colName);
        const a1col = String.fromCharCode('A'.charCodeAt(0) + cellCol);
        const sheetRow = rIndex + 2;

        await writeRange(SHEET_ID, `MasterTracking!${a1col}${sheetRow}`, [[now]]);
      }
    }

    // P5 PDF auto-generation
    if ((payload.submissionStage || '').toUpperCase() === 'P5') {
      try {
        const folderId = await ensureRootFolder(SHEET_ID, process.env.ROOT_FOLDER_ID, matric);

        const pdf = await createPdfReport({
          matric,
          studentName: payload.studentName42 || payload.fullname || '',
          files: saved,
          folderId
        });

        const newVals = await readRange(SHEET_ID, 'MasterTracking!A1:Z10000');
        const newHead = newVals[0] || [];
        const rowIdx2 = newVals.slice(1).findIndex(r => String(r[matIdx] || '') === String(matric)) + 2;

        if (rowIdx2 > 1 && newHead.indexOf('P5_DocUrl') !== -1) {
          const colIdx = newHead.indexOf('P5_DocUrl');
          await writeRange(SHEET_ID, `MasterTracking!${String.fromCharCode(65 + colIdx)}${rowIdx2}`, [[pdf.webViewLink]]);
        }

      } catch (err) {
        console.warn('P5 PDF generation failed:', err);
      }
    }

    res.json({ status: 'ok', savedCount: saved.length });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.toString() });
  }
});

export default router;
