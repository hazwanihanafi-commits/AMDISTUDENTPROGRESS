// services/googleSheets.js
const { google } = require('googleapis');
function getAuthClient() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const scopes = ['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive'];
  const jwt = new google.auth.JWT(key.client_email, null, key.private_key, scopes);
  return jwt;
}
async function getSheetsClient() {
  const auth = getAuthClient();
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}
async function readRange(spreadsheetId, range) {
  const sheets = await getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return resp.data.values || [];
}
async function writeRange(spreadsheetId, range, values, options = {}) {
  const sheets = await getSheetsClient();
  if (options.appendRow) {
    await sheets.spreadsheets.values.append({
      spreadsheetId, range,
      valueInputOption: 'RAW',
      requestBody: { values: options.values }
    });
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId, range, valueInputOption: 'RAW',
    requestBody: { values: values || [[]] }
  });
}
module.exports = { getSheetsClient, readRange, writeRange };
