// =====================================================================
// local-file-store.js — เก็บไฟล์แนบไว้เฉพาะเครื่อง/browser ที่อัปโหลด
// =====================================================================
// ใช้ IndexedDB เพราะเหมาะกับไฟล์ PDF/รูป มากกว่า localStorage
// หมายเหตุ: ไฟล์ที่เก็บด้วยวิธีนี้จะไม่ถูกส่งขึ้น Cloud และเครื่องอื่นเปิดไม่ได้

const DB_NAME = "comform-local-files";
const DB_VERSION = 1;
const STORE_NAME = "attachments";

function activeTenantId() { return window.ComformTenant?.getActiveTenantId?.() || "anonymous"; }

function openLocalFileDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return await response.blob();
}

function safeFileName(name = "file") {
  return String(name).replace(/[\\/:*?"<>|#%{}^~`\[\]\\]/g, "_");
}

function getBlobType(file, blob) {
  return file?.type || blob?.type || "application/octet-stream";
}

async function normalizeAttachmentFile(file) {
  if (file?.file instanceof Blob) {
    const blob = file.file;
    return {
      blob,
      name: file.name || blob.name || "attachment",
      type: file.type || getBlobType(file, blob),
      size: file.size || blob.size || 0
    };
  }

  if (file?.data) {
    const blob = await dataUrlToBlob(file.data);
    return {
      blob,
      name: file.name || "attachment",
      type: getBlobType(file, blob),
      size: file.size || blob.size || 0
    };
  }

  if (file instanceof Blob) {
    return {
      blob: file,
      name: file?.name || "attachment",
      type: file?.type || "application/octet-stream",
      size: file?.size || 0
    };
  }

  throw new Error("ไฟล์แนบไม่ถูกต้องหรือไม่มีข้อมูลไฟล์");
}

export async function saveLocalAttachment(file, record = {}, moduleName = "misc") {
  const db = await openLocalFileDb();
  const normalized = await normalizeAttachmentFile(file);

  const tenantId = activeTenantId();
  const id = [
    "local",
    safeFileName(tenantId),
    safeFileName(moduleName),
    safeFileName(record.branch || "unknown"),
    safeFileName(record.no || record.id || Date.now()),
    Date.now(),
    safeFileName(normalized.name)
  ].join("-");

  const item = {
    id,
    name: normalized.name,
    type: normalized.type,
    size: normalized.size,
    tenantId,
    moduleName,
    docNo: record.no || "",
    branch: record.branch || "",
    createdAt: new Date().toISOString(),
    blob: normalized.blob
  };

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  return {
    provider: "local",
    localOnly: true,
    localId: id,
    name: item.name,
    type: item.type,
    size: item.size,
    note: "ไฟล์นี้เปิดได้เฉพาะเครื่อง/browser ที่อัปโหลด"
  };
}

export async function getLocalAttachmentUrl(localId) {
  const db = await openLocalFileDb();

  const item = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(localId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (!item?.blob) return null;
  if (item.tenantId && item.tenantId !== activeTenantId()) {
    console.warn('ปฏิเสธการเปิดไฟล์ Local ของบริษัทอื่น');
    return null;
  }
  return URL.createObjectURL(item.blob);
}

export async function deleteLocalAttachment(localId) {
  const db = await openLocalFileDb();
  const existing = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(localId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (existing?.tenantId && existing.tenantId !== activeTenantId()) throw new Error('ไม่มีสิทธิ์ลบไฟล์ของบริษัทอื่น');

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(localId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

window.LocalFileStore = {
  saveLocalAttachment,
  getLocalAttachmentUrl,
  deleteLocalAttachment
};
