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

// PDF report placeholder (customize later)
export async function createPdfReport(data) {
  return {
    status: "PDF report creation placeholder",
    data
  };
}
