// services/googleDrive.js
// ESM module providing Drive helper functions used by your API.

import { google } from 'googleapis';
import fetch from 'node-fetch';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import mime from 'mime-types';

const SCOPES = ['https://www.googleapis.com/auth/drive'];

/**
 * Create an authenticated Google API client (JWT) using service account env vars.
 */
function getAuthClient() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
  // In case the key was stored with literal "\n" sequences, convert them:
  if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error('Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY env vars');
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: SCOPES,
  });
}

/**
 * Helper: turn Buffer into readable stream for Drive upload
 */
function bufferToStream(buffer) {
  const stream = new PassThrough();
  stream.end(buffer);
  return stream;
}

/**
 * Ensure a folder exists for the given matric under the rootFolderId.
 * If not exists, create it. Returns folderId.
 *
 * sheetId arg is kept for compatibility with previous calls (not used here).
 */
export async function ensureRootFolder(/* sheetId */ _sheetId, rootFolderId, matric) {
  if (!rootFolderId) {
    throw new Error('ROOT_FOLDER_ID not provided (second argument)');
  }
  if (!matric) {
    throw new Error('matric required to create/find folder');
  }

  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  // Search for folder with exact name under the provided rootFolderId
  const q = `'${rootFolderId}' in parents and name = '${matric}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({ q, fields: 'files(id, name)', pageSize: 10 });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  // Create folder
  const createRes = await drive.files.create({
    requestBody: {
      name: matric,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    },
    fields: 'id, name',
  });

  return createRes.data.id;
}

/**
 * Upload a file to Drive from a public URL into folderId.
 * Returns { id, name, webViewLink, mimeType }
 */
export async function driveUploadFromUrl(url, folderId) {
  if (!url || !folderId) throw new Error('url and folderId required');

  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  // Fetch the file
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url} : ${resp.statusText}`);

  const arrayBuffer = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Determine filename and mime-type
  const urlObj = new URL(url);
  let filename = decodeURIComponent(urlObj.pathname.split('/').pop() || 'file');
  // if query contains filename param, use it (common in some file links)
  if (!filename || filename === '') filename = 'file';
  const contentType = resp.headers.get('content-type') || mime.lookup(filename) || 'application/octet-stream';

  // Upload to Drive
  const createRes = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
      mimeType: contentType,
    },
    media: {
      mimeType: contentType,
      body: bufferToStream(buffer),
    },
    fields: 'id, name, webViewLink',
  });

  // Make sure the file is viewable if desired (optional)
  // Note: service account uploads will be in the service account's Drive.
  // If you want links accessible by humans, you'll need to change permissions:
  try {
    await drive.permissions.create({
      fileId: createRes.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
  } catch (permErr) {
    // If permission change fails, ignore (still returns file info)
    console.warn('Could not set public permission:', permErr.message || permErr);
  }

  return {
    id: createRes.data.id,
    name: createRes.data.name,
    webViewLink: createRes.data.webViewLink || `https://drive.google.com/file/d/${createRes.data.id}/view`,
    mimeType: contentType,
  };
}

/**
 * Create a simple PDF report in-memory that lists the provided files
 * (their names + links) and upload it to Drive inside folderId.
 * Returns the uploaded file metadata.
 *
 * Input example:
 * { matric, studentName, files: [{field,name,url,id}], folderId }
 */
export async function createPdfReport({ matric, studentName = '', files = [], folderId }) {
  if (!matric || !folderId) throw new Error('matric and folderId required for createPdfReport');

  // Build PDF in memory using PDFKit
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const ended = new Promise((resolve) => doc.on('end', resolve));

  // PDF content
  doc.fontSize(18).text('P5 Submission Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Matric: ${matric}`);
  doc.text(`Student: ${studentName}`);
  doc.text(`Generated: ${new Date().toISOString()}`);
  doc.moveDown();

  doc.fontSize(14).text('Files:', { underline: true });
  doc.moveDown(0.5);

  if (!files || files.length === 0) {
    doc.fontSize(12).text('No files uploaded.');
  } else {
    files.forEach((f, i) => {
      const display = `${i + 1}. ${f.name || f.field || 'file'} `;
      doc.fontSize(12).text(display);
      if (f.url) {
        doc.fontSize(10).fillColor('blue').text(f.url, { link: f.url, underline: true });
        doc.fillColor('black');
      }
      doc.moveDown(0.5);
    });
  }

  doc.end();
  await ended;
  const pdfBuffer = Buffer.concat(chunks);

  // Upload PDF to Drive
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const pdfName = `${matric}_P5_report.pdf`;
  const createRes = await drive.files.create({
    requestBody: {
      name: pdfName,
      parents: [folderId],
      mimeType: 'application/pdf',
    },
    media: {
      mimeType: 'application/pdf',
      body: bufferToStream(pdfBuffer),
    },
    fields: 'id, name, webViewLink',
  });

  // Make report readable by anyone with link (optional)
  try {
    await drive.permissions.create({
      fileId: createRes.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  } catch (permErr) {
    console.warn('Could not set report public permission:', permErr.message || permErr);
  }

  return {
    id: createRes.data.id,
    name: createRes.data.name,
    webViewLink: createRes.data.webViewLink || `https://drive.google.com/file/d/${createRes.data.id}/view`,
  };
}

export default {
  driveUploadFromUrl,
  ensureRootFolder,
  createPdfReport,
};
