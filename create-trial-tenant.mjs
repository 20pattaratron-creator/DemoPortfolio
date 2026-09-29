import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const DEFAULT_LIMITS={customers:20,suppliers:10,products:30,quotes:20,invoices:10,receipts:10};
function arg(name,fallback=''){const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):fallback;}
function flag(name){return process.argv.includes(`--${name}`);}
function account(){if(process.env.FIREBASE_SERVICE_ACCOUNT_JSON){const x=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);if(x.private_key)x.private_key=x.private_key.replace(/\\n/g,'\n');return x;}return{projectId:process.env.FIREBASE_ADMIN_PROJECT_ID,clientEmail:process.env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n')};}
function limits(){const out={...DEFAULT_LIMITS};Object.keys(out).forEach(k=>{const v=Number(arg(`limit-${k}`,String(out[k])));if(Number.isFinite(v)&&v>0)out[k]=v;});return out;}
const tenantId=arg('tenant'),name=arg('name'),ownerUid=arg('owner-uid'),ownerEmail=arg('owner-email'),days=Math.max(1,Math.min(60,Number(arg('days','14'))||14));
if(!tenantId||!name||!ownerUid){console.error('Usage: npm run create:trial -- --tenant company-a-trial --name "บริษัท A" --owner-uid UID --owner-email a@example.com --days 14 --apply');process.exit(1);}
const cfg={tenantId,name,ownerUid,ownerEmail,days,limits:limits(),dryRun:!flag('apply')};console.log(cfg);
if(!flag('apply')){console.log('DRY RUN — add --apply to write Firestore.');process.exit(0);}
const a=account();if(!a.projectId||!a.clientEmail||!a.privateKey)throw new Error('Missing Firebase Admin credentials');
const app=getApps().length?getApps()[0]:initializeApp({credential:cert(a)}),db=getFirestore(app);const ref=db.doc(`tenants/${tenantId}`);if((await ref.get()).exists)throw new Error('Tenant already exists');
const expiresAt=Timestamp.fromMillis(Date.now()+days*86400000),batch=db.batch();
batch.set(ref,{name,companyName:name,active:true,plan:'trial',subscriptionStatus:'trial',branchLimit:1,activeBranchCount:1,trialStartedAt:FieldValue.serverTimestamp(),trialExpiresAt:expiresAt,trialLimits:cfg.limits,companyProfile:{nameTh:name,nameEn:'',taxId:'',phone:'',addressTh:''},createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
batch.set(db.doc(`tenants/${tenantId}/branches/ubon`),{tenantId,companyId:tenantId,name:'สาขาสำนักงานใหญ่',code:'ubon',active:true,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
batch.set(db.doc(`users/${ownerUid}`),{tenantId,active:true,email:ownerEmail||'',updatedAt:FieldValue.serverTimestamp()},{merge:true});
batch.set(db.doc(`tenants/${tenantId}/members/${ownerUid}`),{displayName:'Trial Owner',email:ownerEmail||'',role:'owner',active:true,allowedBranches:['*'],createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
await batch.commit();console.log(`Trial created: ${tenantId} · ${days} days · expires ${expiresAt.toDate().toISOString()}`);
