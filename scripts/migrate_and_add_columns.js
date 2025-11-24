// scripts/migrate_and_add_columns.js
import fs from 'fs';
import { google } from 'googleapis';

/* CONFIG */
const SHEET_ID = process.env.SHEET_ID;                   // your Google Sheet ID
const SERVICE_ACCOUNT_JSON = JSON.parse(
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON
);

// tabs:
const TAB_MSC = "MasterTracking_MSc";   // create this tab manually if not exist
const TAB_PHD = "MasterTracking_PhD";   // create this tab manually if not exist

/* Load mapping generated earlier */
const mscMap = JSON.parse(fs.readFileSync('/tmp/timeline_mapping_msc.json', 'utf8'));
const phdMap = JSON.parse(fs.readFileSync('/tmp/timeline_mapping_phd.json', 'utf8'));

/* Google Auth */
async function getSheets() {
  const jwt = new google.auth.JWT(
    SERVICE_ACCOUNT_JSON.client_email,
    null,
    SERVICE_ACCOUNT_JSON.private_key,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  await jwt.authorize();
  return google.sheets({ version: "v4", auth: jwt });
}

/* Read full sheet */
async function readSheet(sheets, tabName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1:ZZ2000`,
  });
  return res.data.values || [];
}

/* Write entire row range */
async function updateSheetRow(sheets, tab, colLetter, rowIndex, value) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!${colLetter}${rowIndex}`,
    valueInputOption: "RAW",
    resource: { values: [[value]] },
  });
}

/* Add missing columns */
async function ensureColumns(tabName, mapping) {
  console.log(`\n=== Processing Tab: ${tabName} ===`);

  const sheets = await getSheets();
  const rows = await readSheet(sheets, tabName);

  if (!rows.length) {
    console.error("Tab empty or missing:", tabName);
    return;
  }

  const header = rows[0];
  const quarterCols = mapping.quarterColumns;

  let addedCount = 0;

  for (const colName of quarterCols) {
    if (!header.includes(colName)) {
      header.push(colName);
      addedCount++;
      console.log(`+ Added column: ${colName}`);
    }
  }

  // full rewrite header row
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: "RAW",
    resource: { values: [header] },
  });

  console.log(`Header updated. Added ${addedCount} new columns.`);

  // Fill empty row values
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    while (row.length < header.length) row.push("");
    rows[r] = row;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: "RAW",
    resource: { values: rows },
  });

  console.log(`Completed filling timeline rows for ${tabName}.`);
}

/* MAIN */
(async () => {
  try {
    console.log("Migrating MSc timeline...");
    await ensureColumns(TAB_MSC, mscMap);

    console.log("Migrating PhD timeline...");
    await ensureColumns(TAB_PHD, phdMap);

    console.log("\n🎉 Migration complete — timeline columns created!");
  } catch (err) {
    console.error("Migration Error:", err);
  }
})();
