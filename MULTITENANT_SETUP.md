# Multi-tenant SaaS ERP — Vercel + Firebase Setup

## 1. สถาปัตยกรรมที่ใช้

แนะนำให้ใช้ **Vercel + Firebase ร่วมกัน** แต่แบ่งหน้าที่ชัดเจน:

- **Vercel**: Host หน้า Vite/HTML/JS/CSS และรัน API ที่ต้องใช้สิทธิ์ Server เช่น เพิ่มสาขาตาม Branch Limit
- **Firebase Authentication**: Login Email/Password และออก ID Token
- **Cloud Firestore**: เก็บข้อมูล ERP แยกตาม Tenant/บริษัท
- **Firebase Storage**: แนะนำสำหรับหลักฐาน/ไฟล์แนบ Production (มี `storage.rules` ในโปรเจกต์นี้แล้ว)
- **Local Storage / IndexedDB**: เป็น Cache/Offline เท่านั้น และเวอร์ชันนี้ Scope ด้วย `tenantId`

Vercel ไม่ควรเป็นฐานข้อมูลหลักของ ERP และห้ามเก็บ Firebase Admin private key ในตัวแปรที่ขึ้นต้นด้วย `VITE_`.

## 2. โครงสร้าง Firestore

```text
users/{uid}
  tenantId: company-a
  active: true

tenants/company-a
  name: บริษัท A จำกัด
  active: true
  subscriptionStatus: active
  plan: business
  branchLimit: 1
  activeBranchCount: 1

  members/{uid}
    role: owner
    active: true
    allowedBranches: ["*"]

  branches/ubon
    name: สาขาสำนักงานใหญ่
    active: true

  quotes/{docId}
  invoices/{docId}
  receipts/{docId}
  productions/{docId}
  expenses/{docId}
  purchaseOrders/{docId}
  goodsReceipts/{docId}
  inventoryMovements/{docId}
  auditLogs/{docId}
  contacts/{contactId}
  products/{productId}
```

บริษัท B ใช้ path คนละ Tenant:

```text
tenants/company-b/...
```

ดังนั้นแม้เลขเอกสารจะเหมือนกัน เช่น `QT690801` ก็ไม่ชนกัน เพราะอยู่คนละ Tenant path.

## 3. ทำไมบริษัท A อ่านบริษัท B ไม่ได้

`firestore.rules` ตรวจ 3 ชั้น:

1. `request.auth.uid` ต้อง Login
2. `users/{uid}.tenantId` ต้องตรงกับ `{tenantId}` ใน path ที่กำลังอ่าน
3. `tenants/{tenantId}/members/{uid}` ต้อง Active และสาขาต้องอยู่ในสิทธิ์

การซ่อนปุ่มด้วย JavaScript ไม่ถือเป็น Security. ต่อให้แก้ DevTools แล้วเรียก Firestore เอง Rules จะปฏิเสธคำขอ Tenant อื่น.

## 4. Branch Limit สำหรับขาย Add-on

Branch Master ฝั่ง Browser ถูกตั้งเป็น read-only ใน Firestore Rules. การสร้างสาขาต้องผ่าน:

```text
POST /api/create-branch
```

Vercel Function จะ:

1. ตรวจ Firebase ID Token
2. หา Tenant จาก `users/{uid}` — ไม่รับ tenantId จาก Browser
3. ตรวจ Role = owner/admin
4. ตรวจ Subscription status
5. ตรวจ `activeBranchCount < branchLimit`
6. สร้าง Branch และเพิ่ม `activeBranchCount` ใน Firestore Transaction

หากลูกค้าจ่ายเพิ่มสาขา ให้ Super Admin/ระบบ Billing ปรับ:

```text
branchLimit: 1 -> 2
```

จากนั้น Owner จึงเพิ่มสาขาที่ 2 ได้.

> รุ่น UI ปัจจุบันยังใช้ Branch key เดิม `ubon` และ `khonkaen` จึงรองรับ Flow 1–2 สาขาได้ก่อน หากต้องการ 3+ สาขา ควร Refactor `BRANCH_TH`, Dashboard filters และ Stock UI ให้เป็น Dynamic Branch Master เต็มรูปแบบ.

## 5. สร้างบริษัทแรก

สร้าง Firebase Authentication User ก่อน แล้วคัดลอก UID.

ตั้งค่า Server env (`.env.local` หรือ Vercel Environment Variables):

```text
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

จากนั้นทดลอง Dry Run:

```bash
npm run bootstrap:tenant -- \
  --tenant company-a \
  --name "บริษัท A จำกัด" \
  --owner-uid FIREBASE_UID \
  --owner-email owner@company-a.com \
  --branch-limit 1 \
  --branches "ubon:สาขาสำนักงานใหญ่" \
  --tax-id "0000000000000" \
  --phone "000-000-0000" \
  --address "ที่อยู่บริษัท"
```

ถ้าถูกต้อง ให้เพิ่ม `--apply` ท้ายคำสั่ง.

บริษัท B ที่ซื้อ 2 สาขา:

```bash
npm run bootstrap:tenant -- \
  --tenant company-b \
  --name "บริษัท B จำกัด" \
  --owner-uid FIREBASE_UID_B \
  --owner-email owner@company-b.com \
  --branch-limit 2 \
  --branches "ubon:สาขาสำนักงานใหญ่,khonkaen:สาขาที่ 00001" \
  --apply
```

## 6. ย้ายข้อมูล Firestore รุ่นเก่า

รุ่นเดิมเก็บ `quotes`, `invoices` ฯลฯ เป็น Top-level collections. รุ่น Multi-tenant จะไม่อนุญาต path เก่านี้.

ตรวจจำนวนข้อมูลก่อน:

```bash
npm run migrate:tenant -- --tenant company-a
```

ย้ายจริง:

```bash
npm run migrate:tenant -- --tenant company-a --apply
```

อย่าใช้ `--delete-source` จนกว่าจะตรวจข้อมูล Tenant ใหม่ครบถ้วนและมี Backup.

## 7. Vercel Environment Variables

### Client — เปิดเผยใน bundle ได้ แต่ต้องใช้ Firestore Rules

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_DEMO_MODE=false
```

### Server Secret — ห้ามมี `VITE_`

```text
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY
```

หรือใช้ `FIREBASE_SERVICE_ACCOUNT_JSON` แทน.

หลังเพิ่ม/แก้ Env ให้ Redeploy Vercel.

## 8. Rules ที่ต้อง Publish

- Firebase Console > Firestore Database > Rules -> `firestore.rules`
- Firebase Console > Storage > Rules -> `storage.rules`

ห้ามใช้ Rules แบบ:

```text
allow read, write: if request.auth != null;
```

สำหรับระบบหลายบริษัท เพราะ Login บริษัทหนึ่งจะสามารถเข้าถึงข้อมูลที่ Rules ไม่แยก Tenant ได้.

## 9. Local cache isolation

เวอร์ชันนี้เปลี่ยน key จากลักษณะเดิม:

```text
biz2_ubon_2026_08
```

เป็น:

```text
erp_tenant::company-a::biz2_ubon_2026_08
erp_tenant::company-b::biz2_ubon_2026_08
```

Customer/Supplier/Product Master, PO, Goods Receipt, Stock Movement, Audit และ Draft เอกสารก็ถูก Scope ตาม Tenant เช่นเดียวกัน.

IndexedDB attachment จะบันทึก `tenantId` และไม่เปิดไฟล์ Local ของ Tenant อื่น.

## 10. สิ่งที่ควรทำก่อนขาย Production เต็มรูปแบบ

1. ใช้ Firebase Storage แทน Google Drive/local-only สำหรับหลักฐาน Production และเขียน uploader ให้ path มี Tenant/Branch
2. ทำ Dynamic Branch Master เพื่อรองรับมากกว่า 2 สาขา
3. ทำ Vercel Super Admin/Billing API สำหรับเพิ่ม `branchLimit`, Suspend, Renew
4. เพิ่ม User invite/Role Management ผ่าน Server API
5. ใช้ Atomic document-number counter ฝั่ง Server/Firestore Transaction สำหรับหลาย User สร้างเอกสารพร้อมกัน
6. ทดสอบ Rules ด้วย Firebase Emulator: Tenant A อ่าน/เขียน Tenant B ต้องถูก Deny ทุกกรณี
7. แยก Firebase Project `demo` กับ `production`

## 11. Super Admin / รับเงินเพิ่มสาขา

บัญชีเจ้าของ SaaS ควรมี Firebase custom claim `superAdmin=true` ซึ่งตั้งได้เฉพาะ Admin SDK:

```bash
npm run set:superadmin -- --uid YOUR_FIREBASE_UID --apply
```

หลังตั้ง claim ให้ Logout/Login ใหม่เพื่อรับ ID Token ใหม่

เมื่อบริษัทซื้อ Add-on สาขา ให้ Super Admin เรียก trusted endpoint:

```text
POST /api/admin/update-subscription
Authorization: Bearer <SUPERADMIN_FIREBASE_ID_TOKEN>

{
  "tenantId": "company-a",
  "branchLimit": 2,
  "subscriptionStatus": "active",
  "plan": "business"
}
```

จากนั้น Owner ของ `company-a` จึงกดเพิ่มสาขาจากหน้า **บริษัท / แพ็กเกจ SaaS** ได้ ระบบ `/api/create-branch` จะตรวจ limit อีกครั้งใน Firestore Transaction

อย่าให้หน้า Browser เขียน `branchLimit` หรือ `subscriptionStatus` ลง Firestore โดยตรง

## 12. Checklist ก่อน Production

ดู `SECURITY_TEST_CHECKLIST.md` และทดสอบ Tenant A / Tenant B แบบ cross-access ก่อนรับข้อมูลจริง

## 13. Company Profile / Branding

หน้า Login เป็นชื่อกลาง `ERP Business Platform` และหลัง Login แถบด้านบนจะเปลี่ยนเป็นชื่อ Tenant อัตโนมัติจาก `tenants/{tenantId}`.

คำสั่ง `bootstrap:tenant` รองรับข้อมูลตั้งต้นเพิ่มเติม เช่น `--name-en`, `--tax-id`, `--phone`, `--address` และเก็บไว้ใน `companyProfile`.

> หมายเหตุ: Template PDF รุ่นเดิมยังมี fallback ของบริษัทตัวอย่างในบางตำแหน่ง เพื่อไม่ให้เอกสารเก่าพัง. ก่อน onboard บริษัทจริงแต่ละราย ควรทำขั้นสุดท้ายให้ Quotation / Delivery-Tax / Receipt อ่าน `companyProfile` และ Logo ของ Tenant เต็มรูปแบบ.

## 14. Security hardening ที่แนะนำเพิ่มเติม

- เปิด **Firebase App Check** สำหรับ Web เพื่อลดการเรียก Firebase จาก client ที่ไม่ใช่แอปที่อนุญาต
- เปิด MFA อย่างน้อยสำหรับ SaaS Super Admin / Owner ที่มีสิทธิ์สูง
- เก็บ Firebase Admin credential เฉพาะ Vercel Server Environment Variables เท่านั้น
- ใช้ Preview Firebase project แยกจาก Production ถ้ามีทีมพัฒนา/ทดสอบหลายคน
- ทดสอบ Firestore/Storage Rules ด้วย Emulator ก่อน deploy ทุกครั้ง
