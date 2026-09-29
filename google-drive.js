// =====================================================================
// google-drive.js — อัปโหลดหลักฐานไป Google Drive ด้วย OAuth Client ID
// =====================================================================
// วิธีนี้ไม่ใช้ Service Account Key จึงเหมาะกับโปรเจกต์ที่ถูกปิดการสร้าง key
// ต้องตั้งค่า VITE_GOOGLE_CLIENT_ID และ VITE_DRIVE_FOLDER_* ใน .env.local / Vercel

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const DRIVE_SCOPE = import.meta.env.VITE_GOOGLE_DRIVE_SCOPE || "https://www.googleapis.com/auth/drive.file";

const DRIVE_FOLDER_MAP = {
  khonkaen: {
    quotes: import.meta.env.VITE_DRIVE_FOLDER_KHONKAEN_QUOTES || "",
    invoices: import.meta.env.VITE_DRIVE_FOLDER_KHONKAEN_INVOICES || "",
    receipts: import.meta.env.VITE_DRIVE_FOLDER_KHONKAEN_RECEIPTS || "",
    productions: import.meta.env.VITE_DRIVE_FOLDER_KHONKAEN_PRODUCTIONS || "",
    expenses: import.meta.env.VITE_DRIVE_FOLDER_KHONKAEN_EXPENSES || ""
  },
  ubon: {
    quotes: import.meta.env.VITE_DRIVE_FOLDER_UBON_QUOTES || "",
    invoices: import.meta.env.VITE_DRIVE_FOLDER_UBON_INVOICES || "",
    receipts: import.meta.env.VITE_DRIVE_FOLDER_UBON_RECEIPTS || "",
    productions: import.meta.env.VITE_DRIVE_FOLDER_UBON_PRODUCTIONS || "",
    expenses: import.meta.env.VITE_DRIVE_FOLDER_UBON_EXPENSES || ""
  }
};

let tokenClient = null;
let accessToken = "";
let tokenExpireAt = 0;

function isConfigured() {
  return Boolean(GOOGLE_CLIENT_ID);
}

function waitForGoogleIdentity() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const started = Date.now();
    const timer = window.setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        window.clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - started > 12000) {
        window.clearInterval(timer);
        reject(new Error("โหลด Google Identity Services ไม่สำเร็จ"));
      }
    }, 100);
  });
}

async function getDriveAccessToken() {
  await waitForGoogleIdentity();

  if (!GOOGLE_CLIENT_ID) {
    throw new Error("ยังไม่ได้ตั้งค่า VITE_GOOGLE_CLIENT_ID");
  }

  if (accessToken && Date.now() < tokenExpireAt) {
    return accessToken;
  }

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: () => {}
    });
  }

  return new Promise((resolve, reject) => {
    tokenClient.callback = response => {
      if (response?.error) {
        reject(new Error(response.error_description || response.error));
        return;
      }

      accessToken = response.access_token;
      tokenExpireAt = Date.now() + 50 * 60 * 1000;
      resolve(accessToken);
    };

    tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
  });
}

function getDriveFolderId(branch, docType) {
  const folderId = DRIVE_FOLDER_MAP?.[branch]?.[docType];

  if (!branch) throw new Error("กรุณาเลือกสาขาก่อนแนบหลักฐาน");
  if (!docType) throw new Error("ไม่พบประเภทเอกสารสำหรับจัดเก็บ Google Drive");
  if (!folderId) throw new Error(`ยังไม่ได้ตั้งค่า Google Drive Folder สำหรับ ${branch}/${docType}`);

  return folderId;
}

function safeFileName(value = "file") {
  return String(value || "file")
    .replace(/[\\/:*?"<>|#%{}^~`\[\]]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 160);
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return await response.blob();
}

async function normalizeFile(file) {
  // New attachment flow keeps the original File in file.file instead of Base64.
  // Legacy Base64 attachments are still supported for old records.
  if (file?.file instanceof Blob) {
    const blob = file.file;
    return {
      blob,
      name: file.name || blob.name || "attachment",
      type: file.type || blob.type || "application/octet-stream",
      size: file.size || blob.size || 0
    };
  }

  if (file?.data) {
    const blob = await dataUrlToBlob(file.data);
    return {
      blob,
      name: file.name || "attachment",
      type: file.type || blob.type || "application/octet-stream",
      size: file.size || blob.size || 0
    };
  }

  if (file instanceof Blob) {
    return {
      blob: file,
      name: file.name || "attachment",
      type: file.type || "application/octet-stream",
      size: file.size || 0
    };
  }

  throw new Error("ไฟล์แนบไม่ถูกต้องหรือไม่มีข้อมูลไฟล์");
}

function buildDriveFileName(fileName, meta = {}) {
  const branch = safeFileName(meta.branch || "unknown");
  const docType = safeFileName(meta.docType || "document");
  const docNo = safeFileName(meta.no || meta.docNo || meta.id || "no-number");
  const customer = safeFileName(meta.customer || meta.desc || meta.job || "record");
  const original = safeFileName(fileName || "evidence");
  return `${branch}_${docType}_${docNo}_${customer}_${Date.now()}_${original}`;
}

const MULTIPART_LIMIT_BYTES = 5 * 1024 * 1024;

function mapDriveResponse(data, normalized, meta = {}) {
  return {
    provider: "google-drive",
    branch: meta.branch || "",
    docType: meta.docType || "",
    fileId: data.id,
    name: data.name,
    originalName: normalized.name,
    type: data.mimeType || normalized.type,
    mimeType: data.mimeType || normalized.type,
    size: Number(data.size || normalized.size || 0),
    webViewLink: data.webViewLink || "",
    webContentLink: data.webContentLink || "",
    uploadedAt: new Date().toISOString()
  };
}

async function parseDriveResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || fallbackMessage);
  }
  return data;
}

async function uploadMultipart(token, folderId, normalized, meta = {}) {
  const metadata = {
    name: buildDriveFileName(normalized.name, meta),
    mimeType: normalized.type,
    parents: [folderId]
  };

  const boundary = "comform_esan_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  const body = new Blob(
    [
      `--${boundary}\r\n`,
      "Content-Type: application/json; charset=UTF-8\r\n\r\n",
      JSON.stringify(metadata),
      "\r\n",
      `--${boundary}\r\n`,
      `Content-Type: ${normalized.type}\r\n\r\n`,
      normalized.blob,
      "\r\n",
      `--${boundary}--`
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink,size",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body
    }
  );
  return await parseDriveResponse(response, "อัปโหลด Google Drive ไม่สำเร็จ");
}

async function uploadResumable(token, folderId, normalized, meta = {}) {
  const metadata = {
    name: buildDriveFileName(normalized.name, meta),
    mimeType: normalized.type,
    parents: [folderId]
  };

  const initResponse = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,webViewLink,webContentLink,size",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": normalized.type,
        "X-Upload-Content-Length": String(normalized.size || normalized.blob.size || 0)
      },
      body: JSON.stringify(metadata)
    }
  );

  if (!initResponse.ok) {
    const data = await initResponse.json().catch(() => ({}));
    throw new Error(data?.error?.message || "เริ่มอัปโหลดไฟล์ขนาดใหญ่ไม่สำเร็จ");
  }

  const uploadUrl = initResponse.headers.get("Location");
  if (!uploadUrl) throw new Error("Google Drive ไม่ได้ส่ง resumable upload URL กลับมา");

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": normalized.type },
    body: normalized.blob
  });
  return await parseDriveResponse(uploadResponse, "อัปโหลดไฟล์ขนาดใหญ่เข้า Google Drive ไม่สำเร็จ");
}

async function uploadFileToDrive(file, meta = {}) {
  if (file?.provider === "google-drive" && file.webViewLink) {
    return file;
  }

  const token = await getDriveAccessToken();
  const folderId = getDriveFolderId(meta.branch, meta.docType);
  const normalized = await normalizeFile(file);

  // Phone photos are often larger than 5 MB. Use resumable upload for them,
  // while keeping multipart upload for smaller images/PDFs.
  const data = normalized.size > MULTIPART_LIMIT_BYTES
    ? await uploadResumable(token, folderId, normalized, meta)
    : await uploadMultipart(token, folderId, normalized, meta);

  return mapDriveResponse(data, normalized, meta);
}

async function uploadEvidenceFiles(files, meta = {}) {
  const list = Array.from(files || []);
  const uploaded = [];

  for (const file of list) {
    uploaded.push(await uploadFileToDrive(file, meta));
  }

  return uploaded;
}

window.GoogleDriveEvidence = {
  isConfigured,
  getDriveAccessToken,
  getDriveFolderId,
  uploadFileToDrive,
  uploadEvidenceFiles
};
