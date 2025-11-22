// services/googleDrive.js
const { google } = require('googleapis');
const fetch = require('node-fetch');
function getAuthClient() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const scopes = ['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/documents','https://www.googleapis.com/auth/spreadsheets'];
  return new google.auth.JWT(key.client_email, null, key.private_key, scopes);
}
async function getDriveClient() {
  const auth = getAuthClient();
  await auth.authorize();
  return google.drive({ version: 'v3', auth });
}
async function ensureRootFolder(spreadsheetId, rootFolderId, matric) {
  const drive = await getDriveClient();
  if (rootFolderId) {
    try {
      const root = await drive.files.get({ fileId: rootFolderId, fields: 'id' });
      return createOrGetStudentFolder(drive, rootFolderId, matric);
    } catch (e) {}
  }
  const q = `name='AMDI_StudentFiles' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list = await drive.files.list({ q, fields: 'files(id,name)', spaces: 'drive' });
  if (list.data.files.length) {
    const id = list.data.files[0].id;
    return createOrGetStudentFolder(drive, id, matric);
  } else {
    const created = await drive.files.create({ requestBody: { name: 'AMDI_StudentFiles', mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
    return createOrGetStudentFolder(drive, created.data.id, matric);
  }
}
async function createOrGetStudentFolder(drive, parentId, matric) {
  const fname = String(matric);
  const q = `name='${fname}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list = await drive.files.list({ q, fields: 'files(id,name)', spaces: 'drive' });
  if (list.data.files.length) return list.data.files[0];
  const created = await drive.files.create({ requestBody: { name: fname, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id,name' });
  return created.data.id || created.data;
}
async function driveUploadFromUrl(url, folderId) {
  const drive = await getDriveClient();
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('download failed ' + resp.status);
  const buf = await resp.buffer();
  const fname = decodeURIComponent(url.split('/').pop().split('?')[0]) || `upload-${Date.now()}`;
  const media = { mimeType: resp.headers.get('content-type') || 'application/octet-stream', body: buf };
  const file = await drive.files.create({
    requestBody: { name: fname, parents: [folderId] },
    media,
    fields: 'id,webViewLink,name'
  });
  return file.data;
}
async function createPdfReport({ matric, studentName, files, folderId }) {
  const auth = getAuthClient();
  await auth.authorize();
  const docs = google.docs({ version: 'v1', auth });
  const title = `P5_Summary_${matric}_${Date.now()}`;
  const doc = await docs.documents.create({ requestBody: { title } });
  const docId = doc.data.documentId;
  const requests = [ { insertText: { location: { index: 1 }, text: `P5 Summary
Student: ${studentName}
Matric: ${matric}

Files:
` } } ];
  if (files && files.length) { files.forEach(f => requests.push({ insertText: { location: { index: 1 }, text: `- ${f.name} : ${f.url}
` } })); }
  await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } });
  const drive = await getDriveClient();
  const exportRes = await drive.files.export({ fileId: docId, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(exportRes.data);
  const file = await drive.files.create({ requestBody: { name: `${title}.pdf`, parents: [folderId] }, media: { mimeType: 'application/pdf', body: buffer }, fields: 'id,webViewLink,name' });
  return file.data;
}
module.exports = { ensureRootFolder, driveUploadFromUrl, createPdfReport };
