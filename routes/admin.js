// routes/admin.js (ESM)
import express from 'express';
import { readRange } from '../services/googleSheets.js';
import { ensureRootFolder } from '../services/googleDrive.js';

const router = express.Router();
const SHEET_ID = process.env.SHEET_ID;

// GET /api/students
router.get('/students', async (req, res) => {
  try {
    const rows = await readRange(SHEET_ID, 'MasterTracking!A1:Z10000');
    const header = rows[0] || [];
    const data = rows.slice(1).map(r => {
      const obj = {};
      header.forEach((h, i) => (obj[h] = r[i] || ''));
      return obj;
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.toString() });
  }
});

// POST /api/generate_pdf
router.post('/generate_pdf', async (req, res) => {
  try {
    const matric = req.body.matric;
    if (!matric) return res.status(400).json({ status: 'error', message: 'missing matric' });

    const rows = await readRange(SHEET_ID, 'MasterTracking!A1:Z10000');
    const header = rows[0] || [];
    const data = rows.slice(1);

    const matIdx = header.indexOf('Matric');
    const idx = data.findIndex(r => String(r[matIdx]) === String(matric));
    if (idx === -1) return res.status(404).json({ status: 'error', message: 'student not found' });

    const row = data[idx];
    const nameIdx = header.indexOf('StudentName');

    const folderId = await ensureRootFolder(SHEET_ID, process.env.ROOT_FOLDER_ID, matric);

    const pdf = await createPdfReport({
      matric,
      studentName: row[nameIdx] || '',
      files: [],
      folderId
    });

    res.json({ status: 'ok', url: pdf.webViewLink });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.toString() });
  }
});

export default router;
