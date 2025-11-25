// services/googleDrive.js
import { google } from "googleapis";
import stream from "stream";

/**
 * Upload a file buffer to Google Drive (under parent folder),
 * then make it viewable by anyone with the link.
 *
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string} mimeType
 * @param {string} parentFolderId
 * @returns {Object} { id, webViewLink, webContentLink, shareUrl }
 */
export async function uploadFileToDrive(buffer, filename, mimeType, parentFolderId) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const client = await auth.getClient();
  const drive = google.drive({ version: "v3", auth: client });

  // Convert buffer to stream
  const bufferStream = new stream.PassThrough();
  bufferStream.end(buffer);

  const createRes = await drive.files.create({
    requestBody: {
      name: filename,
      parents: parentFolderId ? [parentFolderId] : [],
      mimeType,
    },
    media: {
      mimeType,
      body: bufferStream,
    },
    fields: "id, name",
  });

  const fileId = createRes.data.id;

  // Make file readable by anyone with link
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });
  } catch (e) {
    // permission may fail depending on Drive settings; ignore but log
    console.error("drive.permissions.create error:", e?.message || e);
  }

  // Compose shareable link
  const webViewLink = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
  const webContentLink = `https://drive.google.com/uc?export=download&id=${fileId}`;

  return { id: fileId, name: filename, webViewLink, webContentLink, shareUrl: webViewLink };
}
