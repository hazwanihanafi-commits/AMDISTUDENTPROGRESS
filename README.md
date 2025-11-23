# AMDI API + Portal — Fixed Package

This package includes:
- `server.js` - Updated backend that auto-detects Google Sheet headers and supports both legacy fixed-column layout and the user's current sheet.
- `public/portal.html` - Simple portal frontend (static) to demonstrate status and approve actions.
- `sheet-template.csv` - CSV template you can import into Google Sheets (columns A..N).
- `.env.example` - Example environment variables.
- `README.md` - This file.

## Usage

1. Copy `.env.example` to `.env` and fill values:
   - `SPREADSHEET_ID` - your Google Sheets ID
   - `GOOGLE_PROJECT_ID`
   - `GOOGLE_CLIENT_EMAIL`
   - `GOOGLE_PRIVATE_KEY` (replace newlines as `\n` when storing in .env)
   - `SHEET_NAME` (optional, defaults to `MasterTracking`)

2. Ensure the service account email (`GOOGLE_CLIENT_EMAIL`) has access to your Google Sheet.

3. Install and run:
```bash
npm install
node server.js
```

4. Open `http://localhost:3000/portal` to access the demo portal.

## Notes

- The server auto-detects header names on the first row (A1..N1). It will map common header variations:
  - `Matric`, `Matric No`, `MatricNo`
  - `StudentName`, `Student Name`, `Name`
  - `Programme`, `Field`
  - `Year`, `Start Date`
  - `P1 Submitted`, `P1`, `P1_Submitted`
  - `P1 Approved`, `P1 Approved`, `P1Approved`
  - etc.

- If detection fails, the server falls back to legacy fixed-column mapping.

- The `/approve` endpoint will write approval timestamps if approval columns exist; otherwise it will return a message indicating no approval columns present.