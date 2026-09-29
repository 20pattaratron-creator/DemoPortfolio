# Example Company ERP — User Friendly Demo

เวอร์ชันนี้ยึดชุดไฟล์ต้นฉบับล่าสุดของผู้ใช้เป็นฐาน

## Demo Identity
- เบอร์โทรบริษัท: `000-000-0000`
- เลขประจำตัวผู้เสียภาษี: `0000000000000` (13 หลัก)
- ข้อมูลดังกล่าวตั้งใจใช้เป็นข้อมูลตัวอย่างและไม่ควรแทนข้อมูลจริง

## UI Improvements
- เพิ่มแถบลำดับขั้นตอนในฟอร์มเอกสารหลัก
- เพิ่มขนาดช่องกรอกและ Focus state ให้ชัดเจน
- ปรับตัวเลือกสาขา ตารางสินค้า ช่องแนบหลักฐาน และส่วนเชื่อมข้อมูลให้อ่านง่าย
- ทำแถบปุ่มบันทึก/ตัวอย่างให้อยู่ใกล้มือบน Desktop และเรียงแนวตั้งบน Mobile
- ไม่เปลี่ยน Business Logic, Firebase schema, VAT, Workflow และ PDF logic เดิม

## Run
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

- ปรับการแสดงวันที่/ปีบนหน้าเว็บและเอกสารให้แสดง พ.ศ. เท่านั้น โดยยังเก็บปี ค.ศ. ภายในระบบสำหรับ JavaScript/Firebase

## Dashboard / Business Analytics / Forecast Upgrade

เวอร์ชันนี้ปรับ Dashboard และ Business Analytics ให้ใช้สำหรับการเปรียบเทียบและตัดสินใจได้ง่ายขึ้น โดยเพิ่ม:

- Executive comparison cards: Sales, Delivery, Collection, Net Profit พร้อม MoM / YoY
- ตารางเปรียบเทียบรายเดือน พร้อม Delivery Rate, Collection Rate, Net Margin และสถานะที่ควรติดตาม
- ตาราง Business Analytics แบบ sticky header/first column และแสดง MoM / YoY
- Forecast 6 เดือน พร้อมช่วงต่ำ–สูงโดยประมาณ
- ตาราง Model Accuracy แสดง RMSE, MAE, sMAPE และจำนวนรอบ Rolling-origin Cross-validation
- แยก Statistical Base Forecast ออกจาก Quotation Pipeline Scenario เพื่อไม่ผสมยอดที่ยังไม่เกิดจริงเข้ากับโมเดลสถิติ

### Forecast methodology

โหมด Auto จะเปรียบเทียบโมเดลที่มีข้อมูลเพียงพอ แล้วเลือกโมเดลที่มี RMSE ต่ำสุดจาก Rolling-origin time-series cross-validation:

1. Moving Average 3 เดือน
2. Simple Exponential Smoothing (SES)
3. Holt Trend แบบ Damped
4. Holt-Winters Additive สำหรับข้อมูลรายเดือนที่มีฤดูกาล (ต้องมีอย่างน้อย 24 เดือนสำหรับ fit; Auto-CV ต้องมีอย่างน้อย 25 เดือน)
5. Linear Regression ใช้เป็น benchmark

โมเดล Exponential Smoothing จะปรับ smoothing parameters จากข้อมูลแทนการ fix ค่าคงที่เดียว และ Holt-Winters ใช้ season length = 12 สำหรับข้อมูลรายเดือน

ช่วง Forecast ต่ำ/สูงที่แสดงเป็นช่วงประมาณ 80% โดยอิง RMSE จาก cross-validation (`forecast ± 1.28 × RMSE × sqrt(horizon)`) เพื่อสื่อความไม่แน่นอนแบบอ่านง่ายใน Dashboard; ไม่ใช่ prediction interval เชิงสถิติเต็มรูปแบบของ ETS

### References

- Tableau — Forecasting / exponential smoothing: https://help.tableau.com/current/pro/desktop/en-us/forecast_how_it_works.htm
- Oracle Demand Planning — Forecast Methods: https://docs.oracle.com/cd/E18727-01/doc.121/e13634/T295435T293788.htm
- Oracle Demand Planning Cloud — Forecasting Methods: https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25c/faspf/forecasting-methods-for-demand-plans.html
- Forecasting: Principles and Practice — Time-series cross-validation: https://otexts.com/fpp3/tscv.html
- Forecasting: Principles and Practice — Holt trend: https://otexts.com/fpp3/holt.html
- Forecasting: Principles and Practice — Holt-Winters seasonality: https://otexts.com/fpp3/holt-winters.html


## Quant Business Intelligence Upgrade

รุ่นนี้เพิ่ม Quant Layer เพื่อช่วยตัดสินใจโดยไม่เปลี่ยนฐานข้อมูลธุรกิจเดิม:

- Forecast model selection: Rolling-origin cross-validation + RMSE / MAE / sMAPE / MASE
- Forecast uncertainty: P10 / P50 / P90 (80% normal approximation using CV RMSE as empirical error scale)
- Monte Carlo: 5,000 deterministic simulations for next-month target probability
- Revenue risk: sample Coefficient of Variation (CV) และ Peak-to-Trough decline
- Concentration: Customer/Product HHI และ Top-5 revenue share
- Robust anomaly detection: Modified Z-score based on Median Absolute Deviation (MAD), threshold |M| > 3.5
- Quote pipeline: historical approval proxy with add-one smoothing when there are at least 5 historical quotations; otherwise the legacy 35% fallback is shown explicitly
- Stress Test: Sales / Cost / Pipeline conversion shocks
- Business Regime: transparent heuristic from 3-month momentum + short-term slope (ไม่ใช่ hidden ML)

### Method references

- Hyndman & Athanasopoulos, *Forecasting: Principles and Practice (3rd ed.)*: time-series cross-validation, forecast accuracy, prediction intervals, exponential smoothing.
- NIST/SEMATECH e-Handbook: Coefficient of Variation and Median Absolute Deviation / Modified Z-score for robust outlier detection.
- U.S. DOJ Antitrust Division: HHI definition and 1,000/1,800 concentration reference thresholds. In this ERP they are used only as a **customer/product concentration proxy**, not as an antitrust/legal conclusion.

Quant outputs are decision-support estimates, not guarantees. Probability results depend on data quality, history length, and model assumptions.

### Reference URLs

- Forecasting: Principles and Practice — Time-series cross-validation: https://otexts.com/fpp3/tscv.html
- Forecasting accuracy (RMSE, MAE, MASE): https://otexts.com/fpp3/accuracy.html
- Forecast distributions and prediction intervals: https://otexts.com/fpp3/prediction-intervals.html
- Exponential smoothing / ETS: https://otexts.com/fpp3/expsmooth.html
- NIST Coefficient of Variation: https://itl.nist.gov/div898/software/dataplot/refman2/auxillar/coefvari.htm
- NIST Median Absolute Deviation: https://www.itl.nist.gov/div898/software/dataplot/refman2/auxillar/mad.htm
- NIST outlier detection / Modified Z-score: https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm
- U.S. DOJ HHI definition: https://www.justice.gov/atr/herfindahl-hirschman-index

## Workflow Center UI Fix

- แก้ปัญหา `ใบเสร็จรับเงิน` ตกลงไปบรรทัดล่างในศูนย์เชื่อมโยงเอกสาร
- Workflow บน Desktop ใช้ 11 grid tracks ให้ตรงกับ 6 ขั้นตอน + 5 ตัวเชื่อม
- หน้าจอขนาดเล็กใช้ horizontal timeline/scroll แทนการ wrap แบบไม่เป็นระเบียบ
- ปรับ card, connector, spacing และ hover ให้ลำดับเอกสารอ่านง่ายขึ้น
- ตัวเลือกปีในศูนย์เชื่อมโยงเอกสารแสดงเฉพาะ `พ.ศ.` เช่น `พ.ศ. 2569`

## Expense Evidence UX Update

ปรับหน้า **บันทึกค่าใช้จ่ายองค์กร** ให้เหมาะกับการใช้งานหน้างานและบนมือถือมากขึ้น:

- สลับลำดับตัวเลือกสาขาให้ **สาขาสำนักงานใหญ่** แสดงก่อน **สาขาที่ 00001** โดยไม่เปลี่ยน internal key (`ubon` และ `khonkaen`) เพื่อไม่กระทบ Firebase/ข้อมูลเดิม
- เพิ่มปุ่ม **ถ่ายรูปหลักฐาน** ด้วยกล้องหลังของมือถือ (`capture="environment"`)
- ยังคงรองรับการเลือกหลายรูป, PDF, Drag & Drop และ Clipboard Paste
- เพิ่มหมวดค่าใช้จ่ายที่ใช้งานจริง เช่น ค่าน้ำมัน, ซื้อสินค้า/วัสดุบริษัท, ขนส่ง, เดินทาง, สำนักงาน, ซ่อมบำรุง และอื่น ๆ
- เพิ่มข้อมูลร้านค้า/ผู้ขาย, ประเภทเอกสาร, เลขที่เอกสาร, สถานะใบกำกับภาษี และวัตถุประสงค์ค่าใช้จ่าย
- รูปที่กำลังแนบจะแสดงพร้อมหมวดค่าใช้จ่ายและสถานะเอกสาร ทำให้รู้ว่ารูปนั้นเป็นหลักฐานของอะไร
- หน้า **รายการค่าใช้จ่ายองค์กร** เพิ่มคอลัมน์เอกสารภาษี/หลักฐาน และปุ่มดูรายละเอียดพร้อมไฟล์แนบ
- ข้อมูลใหม่ถูกบันทึกเป็น field เพิ่มเติมใน expense record จึงไม่เปลี่ยนสูตร Dashboard หรือโครงสร้างเอกสารเดิม

ตัวอย่าง record ใหม่:

```js
{
  cat: "ค่าน้ำมันเชื้อเพลิง",
  vendor: "สถานีบริการตัวอย่าง",
  desc: "เติมน้ำมันรถบริษัท",
  amount: 1500,
  docType: "receipt_tax_invoice",
  taxStatus: "requested",
  docNo: "",
  purpose: "company",
  attachments: []
}
```

## Quant V2 — Model Governance & Decision Risk

เวอร์ชันนี้เพิ่มแนวคิด Quant ที่อธิบายได้และตรวจย้อนหลังได้ โดยไม่เปลี่ยน Forecast ให้เป็น black box:

- **WAPE** = ผลรวม Absolute Error / ผลรวม Actual ใช้ดูความคลาดเคลื่อนรวมในสเกลธุรกิจ
- **Forecast Bias %** = ผลรวม (Actual - Forecast) / ผลรวม Actual
  - ค่าบวก: โมเดลมีแนวโน้มพยากรณ์ต่ำกว่ายอดจริง (under-forecast)
  - ค่าลบ: โมเดลมีแนวโน้มพยากรณ์สูงกว่ายอดจริง (over-forecast)
- **Tracking Signal** = Cumulative Forecast Error / MAD ใช้เฝ้าระวัง persistent bias; หน้า UI ใช้กรอบ ±4 เป็น operational alert
- **Revenue-at-Risk (P10)** = Base Forecast - P10 ใช้ประมาณ downside gap ของยอดขาย
- **Downside Tail Mean** = ค่าเฉลี่ย 10% สถานการณ์ Monte Carlo ที่แย่ที่สุด
- **Target Shortfall Probability** และ **Expected Target Gap** จาก Monte Carlo
- **HHI Contribution** = Customer Share² เพื่อดูว่าลูกค้ารายใดผลัก concentration risk มากที่สุด
- **Break-even Sales / Margin of Safety** ใน Stress Test
- **Composite Risk Score 0–100** เป็น internal heuristic เท่านั้น โดยให้น้ำหนักเท่ากัน 5 ด้าน: Revenue Volatility, Customer Concentration, Peak-to-Trough Drawdown, Overdue Exposure และ Forecast Risk

### Forecast Model Governance
ตารางเปรียบเทียบโมเดลแสดง RMSE, MAE, WAPE, sMAPE, MASE, Bias และ Tracking Signal พร้อม Quant View เพื่อให้ไม่เลือกโมเดลจาก RMSE เพียงค่าเดียว แม้ Auto mode ยังใช้ Rolling-origin Cross-validation RMSE เป็นเกณฑ์หลักในการเลือกโมเดล เพื่อรักษาพฤติกรรมเดิมของระบบ

### References
- Forecasting: Principles and Practice — Time series cross-validation: https://otexts.com/fpp3/tscv.html
- Forecasting: Principles and Practice — Forecast accuracy: https://otexts.com/fpp3/accuracy.html
- Forecasting: Principles and Practice — Prediction intervals: https://otexts.com/fpp3/prediction-intervals.html
- Amazon Forecast — Evaluating Predictor Accuracy (WAPE/RMSE/MAPE/MASE): https://docs.aws.amazon.com/forecast/latest/dg/metrics.html
- AWS Prescriptive Guidance — Forecast error / Tracking Signal: https://docs.aws.amazon.com/prescriptive-guidance/latest/supply-chain-calculations-quick-suite/forecast-error.html

หมายเหตุ: Composite Risk Score, Revenue-at-Risk naming และ operational thresholds ใน UI เป็นเครื่องมือช่วยตัดสินใจภายใน ไม่ใช่มาตรฐานกำกับดูแลหรือคำแนะนำการลงทุน

## FlowAccount-inspired Master Data / Contact / Product Type Upgrade

เวอร์ชันนี้ออกแบบแนวคิดข้อมูลหลักโดยอ้างอิงแนวทางของ FlowAccount Help Center แต่ไม่ได้เชื่อม FlowAccount API โดยตรง

### 1) Contact Master ในเครื่อง
- จดจำลูกค้าและผู้จำหน่าย/ผู้ผลิตด้วย `localStorage`
- ผู้ติดต่อรองรับบทบาท: ลูกค้า, ผู้จำหน่าย, หรือเป็นทั้งสองอย่าง
- เก็บชื่อ, ที่อยู่, เลขประจำตัวผู้เสียภาษี, สาขา, ผู้ติดต่อ, โทรศัพท์, อีเมล, เครดิต และหมายเหตุ
- เมื่อพิมพ์/เลือกลูกค้าที่เคยบันทึก ระบบเติมข้อมูลที่อยู่และข้อมูลติดต่อกลับเข้าสู่ใบเสนอราคา ใบส่งสินค้า/ใบกำกับภาษี และใบเสร็จรับเงิน
- ลูกค้าใหม่ที่บันทึกเอกสารจะถูกจดจำใน Browser เครื่องนั้น
- Export / Import JSON ของระบบรวม Master Data แล้ว เพื่อย้ายข้อมูลหลักไปเครื่องอื่นได้

แนวคิดอ้างอิง: FlowAccount แบ่งผู้ติดต่อเป็น ลูกค้า / ผู้จำหน่าย / ผู้จำหน่ายและลูกค้า และนำข้อมูลจากสมุดรายชื่อกลับมาใช้เมื่อสร้างเอกสารซื้อขาย
https://flowaccount.com/help-center/category/mobile-app/add-contact

### 2) Supplier / Manufacturer Master
- เพิ่มที่อยู่ผู้ผลิต/ผู้จำหน่าย, Tax ID, ผู้ติดต่อ, โทรศัพท์, อีเมล
- เก็บเครดิตผู้ผลิตและช่วงระยะเวลาส่งสินค้าเป็นค่าเริ่มต้น
- เมื่อเลือกชื่อผู้ผลิตที่เคยบันทึก ระบบเติมข้อมูลผู้ผลิตและเงื่อนไขเริ่มต้นกลับเข้าสู่ใบสั่งผลิต

### 3) Product Master: FlowAccount type + Operational fulfillment type
FlowAccount แบ่งรายการสินค้าเป็น 3 ประเภทหลัก:
- Service
- Non-Inventory
- Inventory

อ้างอิง:
https://flowaccount.com/help-center/category/mobile-app/add-inventory
https://flowaccount.com/help-center/category/inventory/guide-inventory-management

ระบบนี้เก็บ `flowType` ตามแนวคิดดังกล่าว และเพิ่ม `fulfillmentType` สำหรับ Workflow ภายใน ERP:
- `stock` = สินค้าในสต็อก
- `made_to_order` = สินค้าสั่งผลิต/สั่งซื้อเฉพาะงาน
- `service` = บริการ

> `made_to_order` เป็นส่วนขยายของ ERP นี้เพื่อให้เข้ากับ Workflow ของธุรกิจ ไม่ใช่ประเภทสินค้าอย่างเป็นทางการของ FlowAccount

### 4) Workflow แยกสินค้าสต็อกกับสินค้าสั่งผลิต
- สินค้า `made_to_order` จากใบเสนอราคาจะถูกดึงไปสร้างใบสั่งผลิต
- สินค้า `stock` และ `service` จะไม่ถูกบังคับให้เข้าใบสั่งผลิต
- ถ้าพยายามใส่สินค้า `stock` ในใบสั่งผลิต ระบบเตือนให้ยืนยันก่อน
- ในตารางกรอกสินค้าแสดงชนิดสินค้า และสินค้าสต็อกแสดงยอดคงเหลือโดยประมาณ

### 5) Stock estimate ในเวอร์ชันนี้
FlowAccount ใช้สินค้าประเภท Inventory ร่วมกับยอดเริ่มต้น, ใบรับสินค้า และการเคลื่อนไหวสต็อกเพื่อให้ยอดคงเหลือเปลี่ยนตามเอกสาร
อ้างอิง:
https://flowaccount.com/help-center/category/inventory/inventory-system
https://flowaccount.com/help-center/category/buy-function/guide-goods-receipt

ERP เวอร์ชันนี้ยังไม่มีโมดูล Goods Receipt เต็มรูปแบบ ดังนั้นตัวเลข `คงเหลือประมาณ` คำนวณจาก:

`ยอดตั้งต้น - จำนวนที่ขายออกตามใบส่งสินค้า/ใบกำกับภาษี`

จึงควรใช้เป็นข้อมูลช่วยบริหารเบื้องต้น ไม่ใช่ Stock Ledger ทางบัญชีเต็มรูปแบบ จนกว่าจะเพิ่มโมดูลรับสินค้า/ปรับสต็อก/โอนคลังในรุ่นต่อไป

## CSV Import Wizard

เวอร์ชันนี้เพิ่มการนำเข้า CSV สำหรับ Master Data โดยตรงจากหน้า `Export / Import`:

- Customer Master
  - ชื่อลูกค้า, ที่อยู่, เลขผู้เสียภาษี, สาขา, ผู้ติดต่อ, โทรศัพท์, Email, เครดิต และหมายเหตุ
- Supplier / Manufacturer Master
  - ชื่อผู้จำหน่าย/ผู้ผลิต, ที่อยู่, เลขผู้เสียภาษี, ผู้ติดต่อ, เครดิต และระยะเวลาส่งสินค้า
- Product Master
  - SKU, ชื่อสินค้า, หมวด, หน่วย, FlowAccount type, Stock/Made-to-order/Service, Opening Stock, Reorder Point และผู้จำหน่ายหลัก

### ขั้นตอน
1. เลือกไฟล์ `.csv`
2. ระบบตรวจประเภทไฟล์และตัวคั่น Comma / Semicolon / Tab
3. ระบบจับคู่หัวคอลัมน์ภาษาไทย/อังกฤษอัตโนมัติ
4. ผู้ใช้ตรวจหรือแก้ Column Mapping
5. ระบบ Preview และตรวจแถวที่ข้อมูลจำเป็นหาย
6. เลือก `รวม/อัปเดตข้อมูลเดิม` หรือ `แทนที่ Master ประเภทนี้`
7. กด Import เฉพาะแถวที่ผ่านการตรวจ

Master Data จาก CSV จะบันทึกใน Local Storage ของ Browser เครื่องนั้น และรวมอยู่ใน Backup JSON ของระบบเพื่อย้ายข้อมูลไปเครื่องอื่นได้

ไฟล์ตัวอย่างอยู่ในโฟลเดอร์ `csv-templates/` และดาวน์โหลดจากหน้าเว็บได้โดยตรง

---

## Production-like ERP Core Upgrade (รอบล่าสุด)

เวอร์ชันนี้เพิ่มแกนระบบสำหรับให้ Demo ใกล้การทำงานของ ERP จริงมากขึ้น โดยยังคงสถาปัตยกรรม Local-first เพื่อใช้งานได้แม้ Firebase ไม่พร้อม และเพิ่ม Optional Firestore Sync สำหรับ Purchase Order, Goods Receipt, Inventory Movement และ Audit Log เมื่อ Firebase ถูกตั้งค่าแล้ว

### 1) Purchase Order (PO)
- เลข PO อัตโนมัติรูปแบบ `PO + ปี พ.ศ. 2 หลัก + เดือน + Running`
- เลือกสาขา ผู้จำหน่าย ที่อยู่/Tax ID จาก Supplier Master
- บันทึกรายการสินค้า จำนวน ต้นทุน และกำหนดรับ
- สถานะ `Draft / Ordered / Partial / Received / Cancelled`
- ยกเลิก PO ได้เฉพาะเมื่อยังไม่มี Goods Receipt ที่ Post อยู่

### 2) Goods Receipt / รับสินค้าเข้าคลัง
- เลือก PO ที่ยังรับไม่ครบ
- ระบบคำนวณ `สั่งซื้อ / รับแล้ว / ค้างรับ / รับครั้งนี้`
- ป้องกันรับเกินยอด PO
- เมื่อ Post จะสร้าง Stock Movement บวก
- PO เปลี่ยนเป็น `Partial` หรือ `Received` อัตโนมัติ
- ใบรับสินค้าที่ Post แล้วไม่ลบทิ้งตรง ๆ แต่ใช้ `กลับรายการ (Reversal)` ซึ่งสร้าง Stock Movement ติดลบเพื่อรักษาประวัติ

### 3) Inventory / Stock Control แยกสาขา
Product Master เพิ่ม:
- Opening Stock · สำนักงานใหญ่
- Opening Stock · สาขาที่ 00001
- Standard Cost / หน่วย
- Reorder Point

สูตรคงเหลือ:

```text
Stock On Hand
= Opening Stock ของสาขา
+ Goods Receipt
+/- Stock Adjustment
- จำนวนสินค้าจากใบส่งสินค้า/ใบกำกับภาษี
```

ระบบแสดง:
- Stock On Hand แยกสาขา
- Reorder Alert
- Inventory Value จาก Standard Cost
- Stock Movement Ledger
- ยอดติดลบจะแสดงเป็นค่าติดลบจริงเพื่อให้เห็น Data/Stock Issue ไม่ซ่อนเป็นศูนย์

### 4) Stock Guard ก่อนออกใบส่งสินค้า
สำหรับสินค้าที่ตั้งเป็น:

```text
Flow type = Inventory
Fulfillment = สินค้าในสต็อก
```

ระบบจะตรวจ Stock ของสาขาก่อนบันทึกใบส่งสินค้า / ใบกำกับภาษี หากไม่พอจะไม่ให้บันทึกจนกว่าจะ:
- รับสินค้าเข้าคลัง
- ปรับ Stock
- หรือลดจำนวนในเอกสาร

สินค้า Made-to-order และ Service ไม่ถูกบังคับด้วย Stock Guard นี้

### 5) Audit / Control Center
เก็บ Local Audit Trail เช่น:
- Create / Update เอกสารหลัก
- Customer / Supplier / Product Master
- Payment status
- PO
- Goods Receipt
- Stock Adjustment
- Delete / Restore

Audit Log Export เป็น CSV ได้ และเก็บสูงสุดประมาณ 2,500 เหตุการณ์ใน Browser เครื่องนั้น

> เมื่อ Firebase พร้อม ระบบจะ Sync Audit ไป `auditLogs` และ Rules ที่แนบมาปิด update/delete จาก client ปกติแล้ว สำหรับ Production ขั้นสูงควรเพิ่ม retention policy, server timestamp และการสำรอง Audit Log แยกต่างหาก

### 6) Recycle Bin ก่อนลบเอกสาร
ก่อน `delDoc()` ลบเอกสารเดิม ระบบจะเก็บ Snapshot ไว้ใน Recycle Bin ก่อน ทำให้สามารถกู้คืนเอกสารกลับมาได้จาก Audit / Control Center

การกู้คืนจะคืนเข้า Local Store และพยายามบันทึกกลับ Firebase หาก FirebaseService ของเอกสารประเภทนั้นพร้อมใช้งาน

### 7) Backup JSON ครอบคลุม Operational Core
Backup JSON ตอนนี้รวม:
- Customer / Supplier Master
- Product Master
- Purchase Orders
- Goods Receipts
- Inventory Movements
- Audit Log
- Recycle Bin

### 8) CSV Product Master เพิ่มข้อมูลคลัง
Template สินค้าเพิ่มคอลัมน์:
- ยอดตั้งต้นสำนักงานใหญ่
- ยอดตั้งต้นสาขา 00001
- ต้นทุนมาตรฐาน
- จุดสั่งซื้อซ้ำ

ไฟล์ตัวอย่าง: `csv-templates/product-master-template.csv`


### 9) Optional Firestore Operational Sync
เมื่อ Firebase configured และผู้ใช้ Login แล้ว โมดูลใหม่จะ Sync collection:
- `purchaseOrders`
- `goodsReceipts`
- `inventoryMovements`
- `auditLogs`

Local Storage ยังคงเป็น fallback หากอินเทอร์เน็ตหรือ Firebase ใช้งานไม่ได้ และจะ merge ข้อมูลกลับเมื่อ Sync สำเร็จ

> หลังอัปโหลดเวอร์ชันนี้ควร Publish `firestore.rules` ที่แนบมา เพราะมี Rules สำหรับ collection ใหม่ โดย `inventoryMovements` เน้น append-only และ `auditLogs` ห้ามแก้ไข/ลบจาก client ปกติ

## ข้อจำกัดก่อนเรียกว่า Production ERP 100%
เวอร์ชันนี้ใกล้ระบบจริงขึ้นมาก แต่ยังมีหัวข้อที่ควรทำบน Backend หากจะใช้หลายผู้ใช้พร้อมกันจริง เช่น:
- Atomic document number / transaction counter กลาง
- Sync Customer/Supplier/Product Master ผ่าน Firebase แบบ realtime (PO/GR/Stock Ledger มี optional operational sync แล้ว แต่ยังไม่ใช่ realtime listener)
- Role/Permission ระดับเมนูและ action (warehouse / purchasing / accounting / manager)
- Audit retention / tamper-evident hash / server-side event logging สำหรับงานตรวจสอบระดับสูง
- Stock costing แบบ FIFO / Moving Average และการปิดงวด
- Purchase Invoice / AP / Supplier Payment เต็มรูปแบบ
- Return / Credit Note / Debit Note
- Automated database backup และ restore point

ดังนั้นชื่อเวอร์ชันนี้ใช้คำว่า **Production-like** ไม่ใช่รับรองว่าเป็นระบบบัญชี/ERP Production ที่ผ่านการตรวจสอบตามกฎหมายหรือมาตรฐานบัญชี

## Validation ที่ทำกับแพ็กเกจนี้
- `node --check app.js` ผ่าน
- `node --check erp-production-core.js` ผ่าน
- ตรวจ HTML id ซ้ำ: ไม่พบ
- ตรวจ local CSS/JS/Image reference: ไม่พบไฟล์อ้างอิงที่หาย
- พยายาม `npm install` เพื่อรัน Vite build แต่ environment ในรอบนี้ timeout ก่อนติดตั้ง dependency สำเร็จ จึงยังไม่ได้ยืนยัน full browser/Vite end-to-end build

---

## Multi-tenant SaaS / หลายบริษัท (Vercel + Firebase)

รุ่นนี้เพิ่ม Tenant isolation สำหรับการนำ ERP ไปขายหลายบริษัทในระบบเดียว:

- Firestore business data ย้ายไป path `tenants/{tenantId}/{collection}/{docId}`
- `users/{uid}` ทำหน้าที่เป็น immutable bootstrap ไปยังบริษัทของ User
- `members/{uid}` เก็บ Role และสาขาที่ได้รับอนุญาต
- Firestore Rules บังคับ Tenant/Branch isolation จริง ไม่ใช่แค่ซ่อนเมนู
- Browser cache, Master Data และ IndexedDB attachment แยก namespace ด้วย `tenantId`
- เพิ่ม Vercel Functions `/api/tenant-summary` และ `/api/create-branch`
- การเพิ่มสาขาตรวจ `branchLimit` ฝั่ง Server ก่อนสร้าง
- เพิ่ม `storage.rules` สำหรับ Firebase Storage แบบ Tenant/Branch path
- เพิ่ม script `bootstrap:tenant` และ `migrate:tenant`

ดูขั้นตอนติดตั้งฉบับเต็มที่ **`MULTITENANT_SETUP.md`**

## Multi-tenant SaaS Security Upgrade

เวอร์ชันนี้เพิ่มโครงสร้างสำหรับขายระบบเดียวให้หลายบริษัท โดยใช้ `tenantId/companyId` แยกข้อมูลทุกบริษัท:

- Firebase Authentication สำหรับตัวตนผู้ใช้
- `users/{uid}` เป็น bootstrap mapping ไปยัง Tenant เดียว
- Business data อยู่ใต้ `tenants/{tenantId}/...`
- Firestore Rules ตรวจ Tenant + Membership + Role + Branch ทุกครั้ง
- LocalStorage/IndexedDB แยก namespace ตาม Tenant เพื่อไม่ให้ข้อมูล cache ปะปนบน Browser เครื่องเดียวกัน
- Vercel Functions ตรวจ Firebase ID Token สำหรับงานสิทธิ์สูง เช่นเพิ่มสาขาและแก้ Branch Limit
- Branch creation ใช้ Firestore Transaction ตรวจ `activeBranchCount < branchLimit`
- Firebase Admin secrets อยู่ฝั่ง Server เท่านั้นและห้ามใช้ prefix `VITE_`

อ่านขั้นตอน deploy/onboard ได้ที่ `MULTITENANT_SETUP.md` และทดสอบก่อนใช้จริงตาม `SECURITY_TEST_CHECKLIST.md`.

---

## Trial Customer Onboarding

เพิ่ม `trial-mode.js`, `trial-mode.css`, `/api/trial-status`, `/api/admin/create-trial` และ `scripts/create-trial-tenant.mjs` สำหรับให้ลูกค้าทดลองใช้งานแบบ tenant แยกบริษัท

ดูขั้นตอนละเอียดที่ `TRIAL_SETUP.md`

จุดสำคัญ: Firestore Rules ตรวจวันหมดอายุ Trial ที่ server-side rules ทำให้หมดอายุแล้วเป็น Read-only จริง ไม่ได้อาศัย JavaScript ฝั่งหน้าเว็บอย่างเดียว

---

## เพิ่มในรุ่น Trial Business Rules

รุ่นนี้เพิ่มเมนู **สูตร / Business Rules** เพื่อทดสอบกรณีที่แต่ละบริษัทมีสินค้า ลูกค้า ผู้จำหน่าย และสูตรคำนวณไม่เหมือนกัน โดยไม่ hard-code เงื่อนไขรายบริษัทใน `app.js`

ไฟล์ที่เพิ่ม:
- `business-rules.js`
- `business-rules.css`
- `BUSINESS_RULES_TRIAL_GUIDE.md`

ความสามารถหลัก:
- Tenant-scoped pricing policy
- Markup on Cost / Target Gross Margin / Fixed Price
- Cost component controls
- Customer discount override
- Product pricing override
- Commission policy
- Formula Version History
- Firebase sync ที่ `tenants/{tenantId}/settings/businessRules`
- ปุ่มราคาแนะนำในใบเสนอราคา
- Formula Snapshot ในรายการใบเสนอราคา
- Scenario สมมติ 3 แบบ: งานสั่งผลิต / สินค้าสต็อก / บริการ

อ่านรายละเอียดที่ `BUSINESS_RULES_TRIAL_GUIDE.md`
