import { google } from "googleapis";

// Authenticate Google Drive
async function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/drive.file"
    ],
  });

  const client = await auth.getClient();
  return google.drive({ version: "v3", auth: client });
}

// Ensure a folder exists in Drive (create if not)
export async function ensureRootFolder(folderName = "AMDI Reports") {
  const drive = await getDriveClient();

  const search = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}'`,
    fields: "files(id,name)"
  });

  if (search.data.files.length > 0) {
    return search.data.files[0].id;
  }

  const newFolder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder"
    },
    fields: "id"
  });

  return newFolder.data.id;
}

// Upload a file from URL into Drive
export async function driveUploadFromUrl(url, folderId) {
  const drive = await getDriveClient();

  // --- DEBUG: Check if URL returns HTML instead of file ---
  const debugResponse = await fetch(url);
  const raw = await debugResponse.text();
  console.log("FILE FETCH RESPONSE:", raw.slice(0, 200)); // <---- IMPORTANT

  // If the URL returned HTML, stop here
  if (raw.startsWith("<!DOCTYPE") || raw.startsWith("<html")) {
    throw new Error("Invalid file URL — returned HTML instead of a file.");
  }

  // Upload file (use fresh fetch so the stream isn't consumed)
  const res = await drive.files.create({
    requestBody: {
      name: "uploaded-file",
      parents: [folderId]
    },
    media: {
      body: await fetch(url)
    }
  });

  return res.data;
}
