import { google } from "googleapis";

// Authenticate Google Sheets
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

// Read data from a sheet
export async function readRange(spreadsheetId, range) {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return res.data.values || [];
}

// Write data to a sheet
export async function writeRange(spreadsheetId, range, values) {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });

  return res.data;
}

// Optional: if you still need this
export async function getSheetValues(spreadsheetId, range) {
  return readRange(spreadsheetId, range);
}
