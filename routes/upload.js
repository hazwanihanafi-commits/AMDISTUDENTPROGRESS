// routes/upload.js
import express from "express";
import multer from "multer";
import { google } from "googleapis";
import { uploadFileToDrive } from "../services/googleDrive.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB

// small helper to convert 0-based column index => A, B, ... Z, AA...
function colToLetter(col) {
  let s = "";
  while (col >= 0) {
    s = String.fromCharCode((col % 26) + 65) + s;
    col = Math.floor(col / 26) - 1;
  }
  return s;
}

/**
 * POST /api/upload
 * form-data fields:
 *  - matric (string)
 *  - file (file)
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const matric = String(req.body.matric || "").trim();
    if (!matric) return res.status(400).json({ error: "missing matric" });
    if (!req.file) return res.status(400).json({ error: "missing file" });

    const driveFolder = process.env.DRIVE_FOLDER_ID || "1kFe873wmqRI7JEtZ9g1hmTKr7zStL4KY";

    // 1) Upload to Drive
    const uploadRes = await uploadFileToDrive(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      driveFolder
    );

    const fileLink = uploadRes.shareUrl;

    // 2) Write link to spreadsheet MasterTracking sheet
    // We'll:
    // - read header row
    // - ensure "Submission File" column exists (append header if missing)
    // - find matric row index
    // - update the Submission File cell for that row

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheetsClient = google.sheets({ version: "v4", auth: await auth.getClient() });
    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({ error: "SHEET_ID not configured" });
    }

    // Read first 1 row (header)
    const headerResp = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: "MasterTracking!A1:Z1",
    });
    const headers = (headerResp.data.values && headerResp.data.values[0]) || [];

    // find matric column
    let matricIdx = headers.findIndex(h => /matric/i.test(String(h)));
    if (matricIdx === -1) {
      // search whole first row more loosely
      matricIdx = headers.findIndex(h => String(h).toLowerCase().includes("matric"));
    }
    if (matricIdx === -1) {
      return res.status(500).json({ error: "Matric column not found in sheet header" });
    }

    // find Submission File column (create if missing)
    let submissionColIdx = headers.findIndex(h => String(h).trim().toLowerCase() === "submission file");
    if (submissionColIdx === -1) {
      headers.push("Submission File");
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: "MasterTracking!A1:1",
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
      submissionColIdx = headers.length - 1;
    }

    // read all rows to search for matric value
    const allResp = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: "MasterTracking!A1:Z1000",
    });
    const rows = allResp.data.values || [];
    let rowIndex = -1; // 0-based in rows array; sheet row number is index + 1
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cellVal = row[matricIdx] || "";
      if (String(cellVal).trim() === matric) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) {
      return res.status(404).json({ error: "student matric not found in sheet" });
    }

    const sheetRowNumber = rowIndex + 1; // because rows[] includes header at index 0
    const cellAddr = `${colToLetter(submissionColIdx)}${sheetRowNumber}`;

    // Write link into single cell
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `MasterTracking!${cellAddr}`,
      valueInputOption: "RAW",
      requestBody: { values: [[fileLink]] },
    });

    return res.json({ ok: true, fileLink, fileId: uploadRes.id });
  } catch (err) {
    console.error("POST /api/upload error:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

export default router;
