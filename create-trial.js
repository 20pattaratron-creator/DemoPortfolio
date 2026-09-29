import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { verifySuperAdminRequest, jsonError } from '../../server/firebase-admin.js';

const DEFAULT_LIMITS = { customers:20, suppliers:10, products:30, quotes:20, invoices:10, receipts:10 };

function slug(value='') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50);
}

export default async function handler(req,res) {
  if (req.method !== 'POST') return res.status(405).json({ok:false,error:'method-not-allowed'});
  try {
    const admin = await verifySuperAdminRequest(req);
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const ownerUid = String(body.ownerUid || '').trim();
    const ownerEmail = String(body.ownerEmail || '').trim();
    const requestedId = slug(body.tenantId || name);
    const tenantId = requestedId || `trial-${Date.now()}`;
    const days = Math.max(1, Math.min(60, Number(body.days || 14)));
    if (!name || !ownerUid) return res.status(400).json({ok:false,error:'name-and-ownerUid-required'});

    const existing = await admin.db.doc(`tenants/${tenantId}`).get();
    if (existing.exists) return res.status(409).json({ok:false,error:'tenant-exists'});

    const now = Date.now();
    const expiresAt = Timestamp.fromMillis(now + days*86400000);
    const limits = { ...DEFAULT_LIMITS, ...(body.limits || {}) };
    const batch = admin.db.batch();
    batch.set(admin.db.doc(`tenants/${tenantId}`),{
      name, companyName:name, active:true,
      plan:'trial', subscriptionStatus:'trial', branchLimit:1, activeBranchCount:1,
      trialStartedAt:FieldValue.serverTimestamp(), trialExpiresAt:expiresAt, trialLimits:limits,
      companyProfile:{ nameTh:name, nameEn:String(body.nameEn||''), taxId:String(body.taxId||''), phone:String(body.phone||''), addressTh:String(body.address||'') },
      createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()
    });
    batch.set(admin.db.doc(`tenants/${tenantId}/branches/ubon`),{
      tenantId,companyId:tenantId,name:'สาขาสำนักงานใหญ่',code:'ubon',active:true,
      createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()
    });
    batch.set(admin.db.doc(`users/${ownerUid}`),{tenantId,active:true,email:ownerEmail,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    batch.set(admin.db.doc(`tenants/${tenantId}/members/${ownerUid}`),{
      displayName:String(body.ownerName||'Trial Owner'),email:ownerEmail,role:'owner',active:true,allowedBranches:['*'],
      createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()
    });
    await batch.commit();
    return res.status(201).json({ok:true,tenantId,trialDays:days,expiresAt:expiresAt.toMillis(),limits});
  } catch (error) {
    console.error('[create-trial]',error);
    jsonError(res,error);
  }
}
