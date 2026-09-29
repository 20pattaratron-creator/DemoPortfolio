import { FieldValue } from 'firebase-admin/firestore';
import { verifySuperAdminRequest, jsonError } from '../../server/firebase-admin.js';

const ALLOWED_STATUS = new Set(['trial','active','past_due','grace_period','suspended','cancelled']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
  try {
    const ctx = await verifySuperAdminRequest(req);
    const tenantId = String(req.body?.tenantId || '').trim();
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenant-required' });
    const tenantRef = ctx.db.doc(`tenants/${tenantId}`);
    const snap = await tenantRef.get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: 'tenant-not-found' });
    const current = snap.data() || {};

    const patch = { updatedAt: FieldValue.serverTimestamp(), updatedBySuperAdmin: ctx.uid };
    if (req.body?.plan !== undefined) patch.plan = String(req.body.plan || '').trim();
    if (req.body?.subscriptionStatus !== undefined) {
      const status = String(req.body.subscriptionStatus || '').trim();
      if (!ALLOWED_STATUS.has(status)) return res.status(400).json({ ok: false, error: 'invalid-subscription-status' });
      patch.subscriptionStatus = status;
    }
    if (req.body?.branchLimit !== undefined) {
      const branchLimit = Number(req.body.branchLimit);
      const active = Number(current.activeBranchCount || 0);
      if (!Number.isInteger(branchLimit) || branchLimit < 1) return res.status(400).json({ ok: false, error: 'invalid-branch-limit' });
      if (branchLimit < active) return res.status(409).json({ ok: false, error: 'branch-limit-below-active-count' });
      patch.branchLimit = branchLimit;
    }

    await tenantRef.update(patch);
    const updated = (await tenantRef.get()).data() || {};
    res.status(200).json({ ok: true, tenant: { id: tenantId, plan: updated.plan || '', subscriptionStatus: updated.subscriptionStatus || '', branchLimit: updated.branchLimit || 1, activeBranchCount: updated.activeBranchCount || 0 } });
  } catch (error) {
    console.error('[admin/update-subscription]', error);
    jsonError(res, error);
  }
}
