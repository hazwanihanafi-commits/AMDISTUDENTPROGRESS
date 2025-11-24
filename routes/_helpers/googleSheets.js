// routes/_helpers/googleSheets.js
import { google } from 'googleapis';
import fs from 'fs';

export async function getSheetsClientFromEnv() {
  if (!process.env.SERVICE_ACCOUNT_JSON) throw new Error('SERVICE_ACCOUNT_JSON env missing');
  const creds = typeof process.env.SERVICE_ACCOUNT_JSON === 'string'
    ? JSON.parse(process.env.SERVICE_ACCOUNT_JSON)
    : process.env.SERVICE_ACCOUNT_JSON;
  const jwt = new google.auth.JWT(
    creds.client_email, null, creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
  );
  await jwt.authorize();
  return google.sheets({ version: 'v4', auth: jwt });
}

export async function findExistingTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const names = (meta.data.sheets || []).map(s => s.properties.title);
  // prefer common names
  const candidates = ['MasterTracking', 'Form responses', 'Form responses 1', 'Sheet1'];
  for (const c of candidates) if (names.includes(c)) return c;
  return names[0];
}

export async function readSheetRows(sheets, spreadsheetId, tabName) {
  const range = `${tabName}!A1:Z2000`;
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return resp.data.values || [];
}

export async function writeCell(sheets, spreadsheetId, tabName, a1Range, value) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!${a1Range}`,
    valueInputOption: 'RAW',
    resource: { values: [[value]] }
  });
}
