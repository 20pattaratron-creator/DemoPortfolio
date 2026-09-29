import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const COLLECTIONS=['quotes','invoices','receipts','issuedInvoices','issuedReceipts','productions','expenses','purchaseOrders','goodsReceipts','inventoryMovements','auditLogs','salesArchive'];
function arg(name,fallback=''){const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):fallback;}
function flag(name){return process.argv.includes(`--${name}`);}
function account(){if(process.env.FIREBASE_SERVICE_ACCOUNT_JSON){const x=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);if(x.private_key)x.private_key=x.private_key.replace(/\\n/g,'\n');return x;}return{projectId:process.env.FIREBASE_ADMIN_PROJECT_ID,clientEmail:process.env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n')};}
const tenantId=arg('tenant');if(!tenantId){console.error('Usage: node scripts/migrate-legacy-to-tenant.mjs --tenant company-a [--apply] [--delete-source]');process.exit(1);}
const a=account();if(!a.projectId||!a.clientEmail||!a.privateKey)throw new Error('Missing Firebase Admin credentials');
const app=getApps().length?getApps()[0]:initializeApp({credential:cert(a)});const db=getFirestore(app);
let total=0;for(const name of COLLECTIONS){const snap=await db.collection(name).get();console.log(`${name}: ${snap.size} docs`);total+=snap.size;if(!flag('apply'))continue;let batch=db.batch(),count=0;for(const d of snap.docs){batch.set(db.doc(`tenants/${tenantId}/${name}/${d.id}`),{...d.data(),tenantId,companyId:tenantId,migratedFromLegacy:true,migratedAt:FieldValue.serverTimestamp()},{merge:true});if(flag('delete-source'))batch.delete(d.ref);count++;if(count%350===0){await batch.commit();batch=db.batch();}}if(count%350!==0)await batch.commit();}
console.log(flag('apply')?`Migration complete: ${total} docs -> ${tenantId}`:`DRY RUN: ${total} legacy docs found. Add --apply to migrate.`);
