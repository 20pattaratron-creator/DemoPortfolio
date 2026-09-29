import { FieldValue } from 'firebase-admin/firestore';
import { verifyTenantRequest, requireRole, jsonError } from '../server/firebase-admin.js';

function safeId(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
  try {
    const ctx = await verifyTenantRequest(req);
    requireRole(ctx, ['owner', 'admin']);

    const name = String(req.body?.name || '').trim();
    const requestedCode = safeId(req.body?.code || '');
    if (!name) return res.status(400).json({ ok: false, error: 'branch-name-required' });

    const tenantRef = ctx.db.doc(`tenants/${ctx.tenantId}`);
    const branchRef = requestedCode
      ? ctx.db.doc(`tenants/${ctx.tenantId}/branches/${requestedCode}`)
      : ctx.db.collection(`tenants/${ctx.tenantId}/branches`).doc();

    await ctx.db.runTransaction(async tx => {
      const tenantSnap = await tx.get(tenantRef);
      const branchSnap = await tx.get(branchRef);
      if (!tenantSnap.exists) throw Object.assign(new Error('tenant-not-found'), { status: 404 });
      if (branchSnap.exists) throw Object.assign(new Error('branch-code-exists'), { status: 409 });

      const tenant = tenantSnap.data() || {};
      const status = tenant.subscriptionStatus || 'unknown';
      if (!['trial', 'active', 'grace_period'].includes(status)) {
        throw Object.assign(new Error('subscription-not-active'), { status: 402 });
      }
      const branchLimit = Number(tenant.branchLimit ?? tenant.subscription?.branchLimit ?? 1);
      const activeBranchCount = Number(tenant.activeBranchCount ?? 0);
      if (activeBranchCount >= branchLimit) {
        throw Object.assign(new Error('branch-limit-reached'), { status: 409 });
      }

      tx.create(branchRef, {
        name,
        code: requestedCode || branchRef.id,
        active: true,
        createdBy: ctx.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      tx.update(tenantRef, {
        activeBranchCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    res.status(201).json({ ok: true, branch: { id: branchRef.id, name } });
  } catch (error) {
    console.error('[create-branch]', error);
    jsonError(res, error);
  }
}
