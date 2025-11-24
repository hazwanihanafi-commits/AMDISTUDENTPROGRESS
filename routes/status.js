// routes/status.js (ESM)
import express from 'express';
import { google } from 'googleapis';

const router = express.Router();

async function getSheets() {
  const creds = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
  const jwt = new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  await jwt.authorize();
  return google.sheets({ version: "v4", auth: jwt });
}

router.get("/status", async (req, res) => {
  try {
    const matric = (req.query.matric || "").trim();
    if (!matric) {
      return res.json({ status: "error", message: "matric required" });
    }

    const SHEET_ID = process.env.SHEET_ID;
    const sheets = await getSheets();

    // Read full sheet
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "MasterTracking!A1:Z2000",
    });

    const rows = r.data.values || [];
    const headers = rows[0];

    // Find Matric column
    const mIndex = headers.findIndex(h => /matric/i.test(h));
    if (mIndex === -1) {
      return res.json({ status: "error", message: "Matric column missing" });
    }

    // Find matching student row
    const row = rows.find(r => (r[mIndex] || "").toString() === matric);
    if (!row) {
      return res.json({ status: "error", message: "Not found" });
    }

    // Convert row to object
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] || "");

    res.json({
      status: "ok",
      row: obj,
      raw: obj
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: err.toString() });
  }
});

export default router;
