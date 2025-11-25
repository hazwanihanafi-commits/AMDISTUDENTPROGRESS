// services/googleSheets.js
import { google } from "googleapis";

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  return google.sheets({
    version: "v4",
    auth: await auth.getClient()
  });
}

export async function readRange(spreadsheetId, range) {
  const client = await getSheetsClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId,
    range
  });
  return res.data.values || [];
}

// Convert Google serial date → JS Date
function parseDate(value) {
  if (!value) return null;

  // DD/MM/YYYY
  if (typeof value === "string" && value.includes("/")) {
    const d = new Date(value);
    return isNaN(d) ? null : d;
  }

  // Serial number
  if (!isNaN(value)) {
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + value * 86400000);
  }

  return null;
}

export async function readMasterTracking(spreadsheetId) {
  const rows = await readRange(spreadsheetId, "MasterTracking!A1:Z1000");
  if (!rows.length) return [];

  const header = rows[0].map(h => h.trim());
  const data = rows.slice(1);

  return data.map(row => {
    const obj = {};
    header.forEach((h, i) => (obj[h] = row[i] || ""));

    return {
      matric: obj["Matric"] || "",
      name: obj["Student Name"] || "",
      programme: obj["Programme"] || "",
      startDate: parseDate(obj["Start Date"]),

      p1: obj["P1 Submitted"] || "",
      p3: obj["P3 Submitted"] || "",
      p4: obj["P4 Submitted"] || "",
      p5: obj["P5 Submitted"] || "",

      supervisorEmail: obj["Main Supervisor's Email"] || "",
      studentEmail: obj["Student's Email"] || "",

      raw: obj
    };
  });
}
