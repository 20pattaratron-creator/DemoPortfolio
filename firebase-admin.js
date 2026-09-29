import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function serviceAccountFromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (parsed.private_key) parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
    return parsed;
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing FIREBASE_ADMIN_* environment variables');
  }
  return { projectId, clientEmail, privateKey };
}

export function adminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({ credential: cert(serviceAccountFromEnv()) });
}

export function adminDb() {
  return getFirestore(adminApp());
}

export function adminAuth() {
  return getAuth(adminApp());
}

export async function verifyTenantRequest(req) {
  const authHeader = String(req.headers.authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error('missing-token'), { status: 401 });

  const decoded = await adminAuth().verifyIdToken(match[1]);
  const db = adminDb();
  const userSnap = await db.doc(`users/${decoded.uid}`).get();
  if (!userSnap.exists) throw Object.assign(new Error('missing-user-bootstrap'), { status: 403 });
  const bootstrap = userSnap.data() || {};
  const tenantId = String(bootstrap.tenantId || '').trim();
  if (!tenantId || bootstrap.active === false) throw Object.assign(new Error('inactive-user'), { status: 403 });

  const [tenantSnap, memberSnap] = await Promise.all([
    db.doc(`tenants/${tenantId}`).get(),
    db.doc(`tenants/${tenantId}/members/${decoded.uid}`).get()
  ]);
  if (!tenantSnap.exists || !memberSnap.exists) throw Object.assign(new Error('missing-membership'), { status: 403 });
  const tenant = tenantSnap.data() || {};
  const member = memberSnap.data() || {};
  if (tenant.active === false || member.active === false) throw Object.assign(new Error('inactive-membership'), { status: 403 });

  return { decoded, uid: decoded.uid, tenantId, tenant, member, db };
}


export async function verifySuperAdminRequest(req) {
  const authHeader = String(req.headers.authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error('missing-token'), { status: 401 });
  const decoded = await adminAuth().verifyIdToken(match[1]);
  if (decoded.superAdmin !== true) throw Object.assign(new Error('superadmin-required'), { status: 403 });
  return { decoded, uid: decoded.uid, db: adminDb() };
}

export function requireRole(context, allowed = []) {
  const role = String(context.member?.role || 'viewer');
  if (!allowed.includes(role)) throw Object.assign(new Error('insufficient-role'), { status: 403 });
  return role;
}

export function jsonError(res, error) {
  const status = Number(error?.status || 500);
  const safeMessage = status >= 500 ? 'server-error' : (error?.message || 'request-failed');
  res.status(status).json({ ok: false, error: safeMessage });
}
