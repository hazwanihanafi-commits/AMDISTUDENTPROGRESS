AMDI Student Progress - Clean Project
====================================

This clean project is prepared for deployment. For local testing you can use the uploaded spreadsheet:

Local test spreadsheet path:
/mnt/data/MasterTrackingProgress (1).xlsx

When deploying to Render:
- Set environment variables:
  SHEET_ID = <your Google Sheet ID>
  GOOGLE_SERVICE_KEY = <service account JSON>

The service reads tab 'MasterTracking' or falls back to the first sheet.
