// routes/status.js (ESM)
import express from 'express';
import { google } from 'googleapis';
import { getSheetsClientFromEnv, findExistingTab, readSheetRows } from './_helpers/googleSheets.js';

const router = express.Router();

/**
 * GET /api/students
 * returns array of rows (object form) from MasterTracking (header -> value)
 */
router.get('/students', async (req, res) => {
  try {
    const sheets = await getSheetsClientFromEnv();
    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) return res.status(500).json({ status:'error', message:'SHEET_ID missing' });

    const tab = await findExistingTab(sheets, spreadsheetId);
    const rows = await readSheetRows(sheets, spreadsheetId, tab);
    if (!rows.length) return res.json({ status:'ok', students: [] });

    const headers = rows[0].map(h => (h||'').toString().trim());
    const students = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const obj = {};
      headers.forEach((h, idx) => obj[h] = r[idx] !== undefined ? r[idx] : '');
      students.push(obj);
    }

    return res.json({ status:'ok', students });
  } catch (err) {
    console.error('students err', err);
    return res.status(500).json({ status:'error', message: err && err.toString ? err.toString() : String(err) });
  }
});

export default router;
