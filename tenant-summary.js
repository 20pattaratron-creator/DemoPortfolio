import { verifyTenantRequest, jsonError } from '../server/firebase-admin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method-not-allowed' });
  try {
    const ctx = await verifyTenantRequest(req);
    const branchSnap = await ctx.db.collection(`tenants/${ctx.tenantId}/branches`).where('active', '==', true).get();
    const branches = branchSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json({
      ok: true,
      tenant: {
        id: ctx.tenantId,
        name: ctx.tenant.name || ctx.tenant.companyName || '',
        subscriptionStatus: ctx.tenant.subscriptionStatus || 'unknown',
        plan: ctx.tenant.plan || ctx.tenant.subscription?.plan || '',
        branchLimit: Number(ctx.tenant.branchLimit ?? ctx.tenant.subscription?.branchLimit ?? 1),
        activeBranchCount: Number(ctx.tenant.activeBranchCount ?? branches.length),
        trialStartedAt: ctx.tenant.trialStartedAt?.toMillis?.() || null,
        trialExpiresAt: ctx.tenant.trialExpiresAt?.toMillis?.() || null,
        trialLimits: ctx.tenant.trialLimits || {},
        branches
      },
      member: {
        uid: ctx.uid,
        role: ctx.member.role || 'viewer',
        allowedBranches: Array.isArray(ctx.member.allowedBranches) ? ctx.member.allowedBranches : []
      }
    });
  } catch (error) {
    console.error('[tenant-summary]', error);
    jsonError(res, error);
  }
}
