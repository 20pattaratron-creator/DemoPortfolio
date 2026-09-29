# Trial Mode / Onboarding Setup

เวอร์ชันนี้ต่อจาก Multi-tenant SaaS และเพิ่ม Trial Workspace สำหรับลูกค้าแต่ละบริษัท

## สิ่งที่เพิ่ม

- Trial tenant แยกบริษัทด้วย `tenantId`
- ระยะเวลาทดลอง (ค่าเริ่มต้น 14 วัน)
- Firestore Rules บังคับ Read-only หลังวันหมดอายุ
- Usage Limits สำหรับ Customer / Supplier / Product / Quote / Invoice / Receipt
- Onboarding 5 ขั้นตอนบนหน้าเว็บ
- Trial banner แสดงวันคงเหลือ
- PDF preview completion tracking แยกตาม tenant ใน localStorage
- API `/api/trial-status`
- Super Admin API `/api/admin/create-trial`
- CLI `npm run create:trial`

## 1. สร้าง Firebase Auth User ให้ลูกค้าก่อน

Firebase Console -> Authentication -> Users -> Add user

จดค่า UID ของผู้ใช้

## 2. สร้าง Trial tenant

```bash
npm run create:trial -- \
  --tenant company-a-trial \
  --name "บริษัท A จำกัด" \
  --owner-uid FIREBASE_UID \
  --owner-email owner@company-a.com \
  --days 14 \
  --apply
```

ค่าเริ่มต้น Trial:

- 1 สาขา
- 20 ลูกค้า
- 10 ผู้จำหน่าย
- 30 สินค้า
- 20 ใบเสนอราคา
- 10 Invoice
- 10 ใบเสร็จ

ปรับ Limit ได้ เช่น

```bash
npm run create:trial -- \
  --tenant company-b-trial \
  --name "บริษัท B จำกัด" \
  --owner-uid FIREBASE_UID \
  --owner-email owner@company-b.com \
  --days 7 \
  --limit-customers 10 \
  --limit-products 15 \
  --limit-quotes 10 \
  --apply
```

## 3. Deploy Firestore Rules

สำคัญ: Rules เวอร์ชันนี้ตรวจ `trialExpiresAt > request.time` ก่อนอนุญาตการเขียน

```bash
firebase deploy --only firestore:rules
```

หลัง Trial หมดอายุ ผู้ใช้ยังอ่านและ Export ข้อมูลเดิมได้ แต่ Firestore จะปฏิเสธ Create/Update ใหม่

## 4. Deploy Vercel

Environment variables ฝั่ง Server ต้องมี Firebase Admin credentials ตาม `.env.example`

หน้าเว็บใช้:

- `/api/trial-status` สำหรับ Onboarding/Usage
- `/api/admin/create-trial` สำหรับ Super Admin automation

## 5. Flow ที่ลูกค้าเห็น

1. ตรวจข้อมูลบริษัท
2. เพิ่มลูกค้าอย่างน้อย 1 ราย
3. เพิ่มสินค้าอย่างน้อย 1 รายการ
4. สร้างใบเสนอราคาอย่างน้อย 1 ใบ
5. เปิดตัวอย่าง/PDF

เมื่อทำแล้ว checklist จะเปลี่ยนเป็น ✓

## Security note

Trial expiry ถูก enforce ที่ Firestore Rules ไม่ใช่แค่ซ่อนปุ่มใน UI

Usage limit ในเวอร์ชันนี้เป็น UX/Product limit ที่ Client + `/api/trial-status` ใช้ควบคุมการสร้างรายการทั่วไป หากต้องการป้องกันผู้ใช้ที่เจตนาหลีกเลี่ยง quota ผ่าน DevTools แบบเข้มงวด ควรย้าย Create ของ collection ที่คิด quota ไป Vercel Function/Cloud Function แล้วใช้ transaction counter ฝั่ง server ในรุ่น Production Billing ต่อไป
