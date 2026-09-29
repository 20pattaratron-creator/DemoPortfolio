// =====================================================================
// tenant-context.js — tenant isolation helpers for the browser cache
// =====================================================================
// Cloud data is protected by Firestore Security Rules. This file prevents
// localStorage/IndexedDB caches from being shared when different companies
// sign in on the same browser/device.

const ACTIVE_TENANT_SESSION_KEY = 'erp_active_tenant_v1';

function sanitizeTenantId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'anonymous';
}

export function getActiveTenantId() {
  const fromProfile = window.CurrentUser?.tenantId || window.CurrentUser?.companyId || '';
  if (fromProfile) return sanitizeTenantId(fromProfile);
  try {
    const saved = sessionStorage.getItem(ACTIVE_TENANT_SESSION_KEY);
    if (saved) return sanitizeTenantId(saved);
  } catch (_) {}
  return 'anonymous';
}

export function setActiveTenantId(tenantId) {
  const safe = sanitizeTenantId(tenantId);
  try { sessionStorage.setItem(ACTIVE_TENANT_SESSION_KEY, safe); } catch (_) {}
  return safe;
}

export function clearActiveTenantId() {
  try { sessionStorage.removeItem(ACTIVE_TENANT_SESSION_KEY); } catch (_) {}
}

export function tenantStorageKey(baseKey) {
  const base = String(baseKey || 'key');
  return `erp_tenant::${getActiveTenantId()}::${base}`;
}

export function isStorageKeyForActiveTenant(key) {
  return String(key || '').startsWith(`erp_tenant::${getActiveTenantId()}::`);
}

export function unwrapTenantStorageKey(key) {
  const prefix = `erp_tenant::${getActiveTenantId()}::`;
  return String(key || '').startsWith(prefix) ? String(key).slice(prefix.length) : '';
}

window.ComformTenant = {
  getActiveTenantId,
  setActiveTenantId,
  clearActiveTenantId,
  storageKey: tenantStorageKey,
  isStorageKeyForActiveTenant,
  unwrapStorageKey: unwrapTenantStorageKey
};
