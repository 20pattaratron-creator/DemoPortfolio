# Security / Tenant Isolation Test Checklist

ก่อนเปิด Production ให้สร้าง Firebase Auth อย่างน้อย 2 บริษัท:

- User A -> `tenantId = company-a`
- User B -> `tenantId = company-b`

และทดสอบต่อไปนี้ใน Browser/Firestore Emulator:

## Tenant isolation

- [ ] User A เปิด `tenants/company-a/quotes` ได้
- [ ] User A สร้าง Invoice ใน company-a ได้ตามสาขาที่มีสิทธิ์
- [ ] User A อ่าน `tenants/company-b/quotes` ต้องได้ `permission-denied`
- [ ] User A เขียน `tenants/company-b/...` ต้องได้ `permission-denied`
- [ ] User B ทำแบบเดียวกันย้อนกลับและต้องไม่เห็น company-a
- [ ] Top-level legacy `/quotes`, `/invoices` ต้องถูก Deny จาก Web Client

## Branch isolation / billing

- [ ] Tenant ที่มีเฉพาะ `branches/ubon` เขียนเอกสาร `branch=khonkaen` ต้องถูก Deny
- [ ] `branchLimit=1` และ `activeBranchCount=1`: `/api/create-branch` ต้องตอบ `branch-limit-reached`
- [ ] หลัง Super Admin ปรับ `branchLimit=2`: Owner เพิ่ม `khonkaen` ได้
- [ ] User ที่ `allowedBranches=['ubon']` อ่าน Query ของ khonkaen ต้องถูก Deny
- [ ] Owner/Admin อ่านทุกสาขาของ Tenant ตัวเองได้ แต่ Tenant อื่นไม่ได้

## Subscription

- [ ] `active`, `trial`, `grace_period` เขียนข้อมูลได้
- [ ] `past_due`, `suspended`, `cancelled` อ่านข้อมูลเดิมได้ แต่เขียนใหม่ต้องถูก Deny

## Local browser cache

- [ ] Login company-a แล้วสร้างข้อมูล Local -> key ต้องขึ้นต้น `erp_tenant::company-a::`
- [ ] Logout แล้ว Login company-b -> UI ต้องไม่โหลด Local cache ของ company-a
- [ ] Customer/Supplier/Product Master ของ A ไม่แสดงใน B
- [ ] PO/GR/Stock/Audit Local cache ของ A ไม่แสดงใน B
- [ ] IndexedDB attachment ของ A ไม่สามารถเปิดด้วย session ของ B

## Vercel server security

- [ ] `/api/create-branch` ไม่รับ `tenantId` จาก body เป็น source of truth
- [ ] API derive tenant จาก Verified Firebase ID Token -> `users/{uid}` เท่านั้น
- [ ] Firebase Admin private key ไม่มี prefix `VITE_`
- [ ] Firebase Admin secret ไม่ปรากฏใน `dist/` หรือ Browser DevTools
- [ ] `/api/admin/update-subscription` ใช้ได้เฉพาะ ID Token ที่มี `superAdmin=true`

## Recommended automated test

ใช้ Firebase Emulator Suite + `@firebase/rules-unit-testing` ทำ regression test ทุกครั้งที่แก้ `firestore.rules` เพื่อป้องกัน Rule ใหม่เปิดทางให้ Tenant อื่นโดยไม่ตั้งใจ.
