import { verifyTenantRequest, jsonError } from '../server/firebase-admin.js';

const DEFAULT_LIMITS = { customers:20, suppliers:10, products:30, quotes:20, invoices:10, receipts:10 };

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

async function countQuery(query) {
  try {
    const agg = await query.count().get();
    return Number(agg.data().count || 0);
  } catch (_) {
    const snap = await query.get();
    return snap.size;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'method-not-allowed' });
  try {
    const ctx = await verifyTenantRequest(req);
    const tenant = ctx.tenant || {};
    const plan = String(tenant.plan || tenant.subscription?.plan || '').toLowerCase();
    const subscriptionStatus = String(tenant.subscriptionStatus || tenant.subscription?.status || 'unknown');
    const isTrial = plan === 'trial' || subscriptionStatus === 'trial' || subscriptionStatus === 'trial_expired';
    const expiresAtMs = millis(tenant.trialExpiresAt || tenant.subscription?.trialExpiresAt);
    const now = Date.now();
    const expired = isTrial && expiresAtMs > 0 && expiresAtMs <= now;
    const remainingMs = expiresAtMs > now ? expiresAtMs - now : 0;
    const remainingDays = expiresAtMs ? Math.max(0, Math.ceil(remainingMs / 86400000)) : null;
    const limits = { ...DEFAULT_LIMITS, ...(tenant.trialLimits || tenant.subscription?.trialLimits || {}) };

    const root = ctx.db.collection(`tenants/${ctx.tenantId}/contacts`);
    const [customers, suppliers, products, quotes, invoices, receipts] = await Promise.all([
      countQuery(root.where('role','in',['customer','both'])),
      countQuery(root.where('role','in',['supplier','both'])),
      countQuery(ctx.db.collection(`tenants/${ctx.tenantId}/products`)),
      countQuery(ctx.db.collection(`tenants/${ctx.tenantId}/quotes`)),
      countQuery(ctx.db.collection(`tenants/${ctx.tenantId}/invoices`)),
      countQuery(ctx.db.collection(`tenants/${ctx.tenantId}/receipts`))
    ]);

    const companyProfile = tenant.companyProfile || {};
    const companyReady = Boolean(
      (companyProfile.nameTh || tenant.name || tenant.companyName) &&
      (companyProfile.addressTh || companyProfile.taxId || companyProfile.phone)
    );

    return res.status(200).json({
      ok:true,
      trial:{
        enabled:isTrial,
        expired,
        subscriptionStatus,
        plan,
        startedAt: millis(tenant.trialStartedAt || tenant.subscription?.trialStartedAt) || null,
        expiresAt: expiresAtMs || null,
        remainingDays,
        limits,
        counts:{ customers, suppliers, products, quotes, invoices, receipts },
        onboarding:{ company:companyReady, customer:customers>0, product:products>0, quote:quotes>0 }
      }
    });
  } catch (error) {
    console.error('[trial-status]', error);
    jsonError(res,error);
  }
}
