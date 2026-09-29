# Business Rules / Formula Lab — คู่มือทดลอง

เวอร์ชันนี้ต่อยอดจาก Trial Onboarding + Multi-tenant SaaS ERP และเพิ่ม Business Rules แบบแยกตาม Tenant

## เป้าหมาย

บริษัทแต่ละรายสามารถมี:
- Customer Master ของตนเอง
- Supplier / Manufacturer Master ของตนเอง
- Product Master ของตนเอง
- สูตรตั้งราคาของตนเอง
- Product Override ของตนเอง
- Customer Discount Override ของตนเอง
- Commission Policy ของตนเอง
- Formula Version History ของตนเอง

ข้อมูลทั้งหมดถูก scope ด้วย `tenantId` ทั้งใน Browser cache และ Firestore path

## สูตรที่รองรับใน Trial

### 1. Markup on Cost

`ราคาก่อนส่วนลด = ต้นทุนตรง × (1 + Markup%)`

ตัวอย่าง ต้นทุน 10,000 บาท และ Markup 25%

`10,000 × 1.25 = 12,500 บาท`

### 2. Target Gross Margin

`ราคาก่อนส่วนลด = ต้นทุนตรง ÷ (1 - Target Margin%)`

ตัวอย่าง ต้นทุน 10,000 บาท และ Target Margin 25%

`10,000 ÷ 0.75 = 13,333.33 บาท`

### 3. Fixed Price / Rate

ใช้ค่าที่กำหนดเป็นราคาก่อนส่วนลดโดยตรง

## ต้นทุนตรง

ผู้ดูแลสูตรสามารถเลือกว่าจะรวม:
- ค่าขนส่ง
- ค่าแรง
- ค่าออกแบบ
- ต้นทุนทางตรงอื่น

เข้ากับต้นทุนฐานหรือไม่

## ลำดับ Rule

1. Company Default
2. Product Override
3. Customer Discount Override
4. Document Override

เอกสารเก็บ Formula Snapshot ณ เวลาสร้าง เพื่อช่วย Audit เมื่อตั้งสูตรใหม่ในอนาคต

## Scenario ตัวอย่าง

มีข้อมูลสมมติ 3 แบบ:
1. ธุรกิจงานสั่งผลิต
2. ธุรกิจสินค้าในสต็อก
3. ธุรกิจบริการ

กด Scenario เพื่อ Preview สูตรก่อน และกด `โหลด Scenario + Master Data ลง Trial นี้` เพื่อบันทึกเฉพาะ Tenant ปัจจุบัน

## ใบเสนอราคา

ในคอลัมน์ราคา/หน่วยมีปุ่ม `⚙ ราคาแนะนำ`

ระบบจะใช้:
- Standard Cost จาก Product Master
- สูตรของบริษัท
- Product Override ถ้ามี
- ส่วนลดลูกค้า ถ้ามี

แล้วใส่ราคาขายแนะนำลงในแถวใบเสนอราคา

เมื่อบันทึกใบเสนอราคา ระบบเก็บ:
- `businessRuleVersion`
- `businessRuleCode`
- `pricingRuleSnapshot` ต่อรายการสินค้า

## Firebase

Business Rules ถูกเก็บที่:

`tenants/{tenantId}/settings/businessRules`

Firestore Rules ในชุดนี้กำหนดให้เฉพาะ role `owner`, `admin`, `manager` สามารถแก้ Business Rules ได้ ส่วนสมาชิก Tenant ที่ active อ่านได้

## ข้อจำกัดของ Trial

- ไม่ใช้ `eval()` และไม่ยอมให้ผู้ใช้เขียน JavaScript Formula เอง
- VAT ใช้ Logic ระบบ 7% หรือเลือกไม่คิด VAT ใน Formula Lab
- ราคาแนะนำจากใบเสนอราคาใช้ Standard Cost ใน Product Master; ค่าแรง/ขนส่งเฉพาะงานควรคำนวณใน Formula Lab หรือพัฒนา Cost Sheet ต่อใน Production
- สำหรับ Production จริงควรเพิ่ม approval workflow เมื่อ Margin ต่ำกว่าเกณฑ์ และ server-side validation สำหรับ Rule ที่มีผลต่อราคา
