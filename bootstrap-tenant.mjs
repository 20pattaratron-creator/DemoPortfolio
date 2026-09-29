import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function arg(name, fallback='') {
  const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):fallback;
}
function flag(name){return process.argv.includes(`--${name}`);}
function account(){
  if(process.env.FIREBASE_SERVICE_ACCOUNT_JSON){const x=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);if(x.private_key)x.private_key=x.private_key.replace(/\\n/g,'\n');return x;}
  return{projectId:process.env.FIREBASE_ADMIN_PROJECT_ID,clientEmail:process.env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n')};
}
const tenantId=arg('tenant');const name=arg('name');const ownerUid=arg('owner-uid');const ownerEmail=arg('owner-email');
const branchLimit=Number(arg('branch-limit','1'))||1;const status=arg('status','active');
const companyProfile={nameTh:name,nameEn:arg('name-en',''),taxId:arg('tax-id',''),phone:arg('phone',''),addressTh:arg('address','')};
const branchSpec=arg('branches','ubon:สาขาสำนักงานใหญ่');
if(!tenantId||!name||!ownerUid){console.error('Usage: node scripts/bootstrap-tenant.mjs --tenant company-a --name "บริษัท A" --owner-uid UID --owner-email a@example.com --branch-limit 1 --branches "ubon:สาขาสำนักงานใหญ่" --apply');process.exit(1);}
const branches=branchSpec.split(',').map(x=>{const [id,...rest]=x.split(':');return{id:id.trim(),name:rest.join(':').trim()||id.trim()};}).filter(x=>x.id);
console.log({tenantId,name,ownerUid,ownerEmail,branchLimit,status,branches,dryRun:!flag('apply')});
if(!flag('apply')){console.log('DRY RUN — add --apply to write Firestore.');process.exit(0);}
const a=account();if(!a.projectId||!a.clientEmail||!a.privateKey){throw new Error('Missing Firebase Admin credentials');}
const app=getApps().length?getApps()[0]:initializeApp({credential:cert(a)});const db=getFirestore(app);
const batch=db.batch();const tenantRef=db.doc(`tenants/${tenantId}`);
batch.set(tenantRef,{name,companyName:name,companyProfile,active:true,subscriptionStatus:status,plan:'business',branchLimit,activeBranchCount:branches.length,updatedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp()},{merge:true});
branches.forEach(b=>batch.set(db.doc(`tenants/${tenantId}/branches/${b.id}`),{name:b.name,code:b.id,active:true,updatedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp()},{merge:true}));
batch.set(db.doc(`users/${ownerUid}`),{tenantId,active:true,email:ownerEmail||'',updatedAt:FieldValue.serverTimestamp()},{merge:true});
batch.set(db.doc(`tenants/${tenantId}/members/${ownerUid}`),{displayName:'Owner',email:ownerEmail||'',role:'owner',active:true,allowedBranches:['*'],updatedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp()},{merge:true});
await batch.commit();console.log('Tenant bootstrap completed:',tenantId);
