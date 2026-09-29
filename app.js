
// ============================================================
// BASIC HELPERS
// Google Drive integration is optional. When it is unavailable, file attachments
// fall back to IndexedDB on the current browser through LocalFileStore.
// ============================================================

// ============================================================
// TOAST NOTIFICATIONS — ใช้แทน alert ทั้งระบบ (ไม่บล็อกหน้าจอ, ดูเป็นมืออาชีพ)
// เรียกใช้เหมือน alert เดิมได้เลย: notify('ข้อความ') หรือ notify('ข้อความ','error')
// ============================================================
function ensureToastContainer(){
  let box = document.getElementById('app-toast-container');
  if (!box) {
    box = document.createElement('div');
    box.id = 'app-toast-container';
    document.body.appendChild(box);
  }
  return box;
}
function notify(message, type, duration = 4200){
  const text = String(message ?? '');
  if (!type) type = /สำเร็จ|เรียบร้อย|เสร็จสิ้น/.test(text) ? 'success' : 'error';
  const box = ensureToastContainer();
  const el = document.createElement('div');
  el.className = `app-toast app-toast-${type}`;
  const icon = type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
  el.innerHTML = `<span class="app-toast-icon">${icon}</span><span class="app-toast-msg">${escapeHtml(String(message ?? ''))}</span><button type="button" class="app-toast-close" aria-label="ปิด">✕</button>`;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const remove = () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector('.app-toast-close').addEventListener('click', remove);
  if (duration > 0) setTimeout(remove, duration);
}
window.notify = notify;
// alert เดิมทั่วทั้งระบบ (app.js และโมดูลเอกสารต่าง ๆ) ถูกแทนที่ด้วย notify แล้ว
// เก็บ window.alert ไว้เป็น fallback เผื่อโค้ดส่วนอื่นเรียกตรง ๆ ให้ยังไม่พังหน้าจอไปเลย
if (!window.__nativeAlert) window.__nativeAlert = window.alert.bind(window);

function getElValue(id){
  const el=document.getElementById(id);
  return el ? String(el.value||'').trim() : '';
}
function escapeHtml(str=''){
  return String(str).replace(/[&<>'"]/g, ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[ch]));
}

function roundMoneyValue(value){
  return Math.round(((Number(value)||0)+Number.EPSILON)*100)/100;
}
function calculateVatSummary(rawSaleTotal,useVat){
  const itemTotal=roundMoneyValue(rawSaleTotal);
  if(Number(useVat)===1){
    const subtotal=itemTotal;
    const vatAmt=roundMoneyValue(subtotal*0.07);
    return{itemTotal,subtotal,vatAmt,total:roundMoneyValue(subtotal+vatAmt),vatMode:'add'};
  }
  const subtotal=roundMoneyValue(itemTotal*100/107);
  const vatAmt=roundMoneyValue(itemTotal-subtotal);
  return{itemTotal,subtotal,vatAmt,total:roundMoneyValue(subtotal+vatAmt),vatMode:'extract'};
}
function resolveVatMode(doc={}){
  if(doc.vatMode==='add'||doc.vatMode==='extract'||doc.vatMode==='none')return doc.vatMode;
  if(Number(doc.vatAmt||0)>0)return Number(doc.useVat||0)===1?'add':'extract';
  return 'none';
}
function vatModeLabel(doc={}){
  const mode=resolveVatMode(doc);
  if(mode==='add')return 'รวม VAT 7% (บวก VAT เพิ่ม)';
  if(mode==='extract')return 'ไม่รวม VAT 7% (ถอด VAT จากยอดขายรวม)';
  return 'ไม่มี VAT';
}

function invoiceNetSales(doc={}){
  // Dashboard must use sales value excluding VAT, matching the invoice report.
  const hasNumber=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  if(hasNumber(doc.subtotal))return roundMoneyValue(Number(doc.subtotal));

  const itemSale=hasNumber(doc.itemSaleTotal)?Number(doc.itemSaleTotal):null;
  const rawSale=hasNumber(doc.saleTotal)?Number(doc.saleTotal):null;
  const grandTotal=hasNumber(doc.total)?Number(doc.total):null;
  const mode=resolveVatMode(doc);

  if(mode==='extract'){
    const gross=itemSale??rawSale??grandTotal??0;
    return roundMoneyValue(gross*100/107);
  }
  if(mode==='add'){
    if(itemSale!==null)return roundMoneyValue(itemSale);
    if(rawSale!==null)return roundMoneyValue(rawSale);
    if(grandTotal!==null)return roundMoneyValue(grandTotal/1.07);
  }
  if(itemSale!==null)return roundMoneyValue(itemSale);
  if(rawSale!==null)return roundMoneyValue(rawSale);
  return roundMoneyValue(grandTotal??0);
}

// ============================================================
// CONSTANTS & GLOBALS
// ============================================================
const MONTHS=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const UNITS=['กล่อง','ชุด','เครื่อง','ดวง','ม้วน','ตลับ','อัน','แผ่น','ขวด','ถุง','เล่ม','ซอง','อื่น ๆ'];
const BRANCH_TH={khonkaen:'สาขาที่ 00001',ubon:'สาขาสำนักงานใหญ่'};
function tenantLocalKey(base){return window.ComformTenant?.storageKey?.(base)||String(base||'');}

// ============================================================
// PRODUCT MASTER — รายชื่อสินค้าตัวอย่างสำหรับ Auto-complete และ Product Analytics
// แก้/เพิ่มรายการได้ที่จุดนี้โดยไม่กระทบข้อมูลเอกสารเดิม
// ============================================================
const PRODUCT_MASTER=[
  {code:'IT-001',name:'คอมพิวเตอร์ตั้งโต๊ะ',category:'คอมพิวเตอร์และอุปกรณ์'},
  {code:'IT-002',name:'โน้ตบุ๊ก',category:'คอมพิวเตอร์และอุปกรณ์'},
  {code:'IT-003',name:'จอคอมพิวเตอร์',category:'คอมพิวเตอร์และอุปกรณ์'},
  {code:'IT-004',name:'คีย์บอร์ดและเมาส์',category:'คอมพิวเตอร์และอุปกรณ์'},
  {code:'IT-005',name:'External SSD / Hard Disk',category:'คอมพิวเตอร์และอุปกรณ์'},
  {code:'IT-006',name:'RAM / หน่วยความจำ',category:'คอมพิวเตอร์และอุปกรณ์'},
  {code:'PR-001',name:'เครื่องพิมพ์เลเซอร์',category:'เครื่องพิมพ์และสำนักงาน'},
  {code:'PR-002',name:'เครื่องพิมพ์มัลติฟังก์ชัน',category:'เครื่องพิมพ์และสำนักงาน'},
  {code:'PR-003',name:'เครื่องสแกนเอกสาร',category:'เครื่องพิมพ์และสำนักงาน'},
  {code:'NW-001',name:'Router / Wi-Fi Router',category:'ระบบเครือข่าย'},
  {code:'NW-002',name:'Network Switch',category:'ระบบเครือข่าย'},
  {code:'NW-003',name:'Wireless Access Point',category:'ระบบเครือข่าย'},
  {code:'NW-004',name:'สาย LAN / อุปกรณ์ Network',category:'ระบบเครือข่าย'},
  {code:'PW-001',name:'เครื่องสำรองไฟ UPS',category:'ไฟฟ้าและสำรองไฟ'},
  {code:'AV-001',name:'โปรเจคเตอร์',category:'ภาพและเสียง'},
  {code:'AV-002',name:'จอรับภาพโปรเจคเตอร์',category:'ภาพและเสียง'},
  {code:'AV-003',name:'ชุดไมโครโฟน / ระบบเสียง',category:'ภาพและเสียง'},
  {code:'SEC-001',name:'กล้องวงจรปิด CCTV',category:'ระบบรักษาความปลอดภัย'},
  {code:'SEC-002',name:'เครื่องบันทึก NVR / DVR',category:'ระบบรักษาความปลอดภัย'},
  {code:'SW-001',name:'Microsoft 365 License',category:'ซอฟต์แวร์และลิขสิทธิ์'},
  {code:'SW-002',name:'Windows License',category:'ซอฟต์แวร์และลิขสิทธิ์'},
  {code:'SW-003',name:'Antivirus / Endpoint Security License',category:'ซอฟต์แวร์และลิขสิทธิ์'},
  {code:'SV-001',name:'บริการติดตั้งและตั้งค่าระบบ',category:'บริการ'},
  {code:'SV-002',name:'บริการเดินสายระบบเครือข่าย LAN',category:'บริการ'},
  {code:'SV-003',name:'บริการบำรุงรักษาระบบ (Maintenance)',category:'บริการ'},
  {code:'SV-004',name:'บริการอบรมการใช้งาน',category:'บริการ'}
];
const CONTACT_MASTER_KEY='comform_contact_master_v1';
const PRODUCT_MASTER_LOCAL_KEY='comform_product_master_v1';
let masterEditState={customer:'',supplier:'',product:''};
function normalizeProductKey(value){return String(value||'').toLowerCase().replace(/\s+/g,' ').trim();}
function defaultProductFlowType(row={}){
  if(String(row.category||'').includes('บริการ'))return'service';
  return'non_inventory';
}
function defaultProductFulfillment(row={}){
  const flow=row.flowType||defaultProductFlowType(row);
  if(flow==='service')return'service';
  if(flow==='non_inventory')return'made_to_order';
  return'stock';
}
function readLocalMaster(key,fallback=[]){
  try{const raw=localStorage.getItem(tenantLocalKey(key));const data=raw?JSON.parse(raw):fallback;return Array.isArray(data)?data:fallback;}catch(err){console.warn('อ่าน Master Data ไม่สำเร็จ',key,err);return fallback;}
}
let masterCloudSyncTimer=null;
let masterCloudReady=false;
function localMasterSnapshot(){
  return{
    contacts:readLocalMaster(CONTACT_MASTER_KEY,[]),
    products:readLocalMaster(PRODUCT_MASTER_LOCAL_KEY,[])
  };
}
function queueMasterCloudSync(){
  if(!masterCloudReady)return;
  clearTimeout(masterCloudSyncTimer);
  masterCloudSyncTimer=setTimeout(()=>{
    const service=window.FirebaseService;
    if(!service?.configured||typeof service.saveMasterSnapshot!=='function')return;
    service.saveMasterSnapshot(localMasterSnapshot()).catch(err=>console.warn('Sync Master Data ไป Firebase ไม่สำเร็จ',err));
  },350);
}
function writeLocalMaster(key,rows,options={}){
  try{
    localStorage.setItem(tenantLocalKey(key),JSON.stringify(rows||[]));
    if(!options.skipCloud)queueMasterCloudSync();
    return true;
  }catch(err){console.error('บันทึก Master Data ไม่สำเร็จ',key,err);notify('บันทึกข้อมูลหลักลงเครื่องไม่สำเร็จ: '+(err?.message||err));return false;}
}
function mergeMasterRows(localRows=[],cloudRows=[],kind='contact'){
  const keyOf=row=>kind==='product'?normalizeProductKey(row?.code||row?.name):String(row?.id||normalizeProductKey(row?.name));
  const map=new Map();
  [...localRows,...cloudRows].forEach(row=>{
    if(!row)return;const key=keyOf(row);if(!key)return;
    const current=map.get(key);
    const curTime=Date.parse(current?.updatedAt||current?.createdAt||0)||0;
    const rowTime=Date.parse(row?.updatedAt||row?.createdAt||0)||0;
    if(!current||rowTime>=curTime)map.set(key,{...current,...row});
  });
  return[...map.values()];
}
async function hydrateTenantMasterFromCloud(){
  const service=window.FirebaseService;
  if(!service?.configured||typeof service.loadMasterSnapshot!=='function')return false;
  try{
    const cloud=await service.loadMasterSnapshot();
    if(Array.isArray(cloud.contacts)&&cloud.contacts.length){
      writeLocalMaster(CONTACT_MASTER_KEY,mergeMasterRows(readLocalMaster(CONTACT_MASTER_KEY,[]),cloud.contacts,'contact'),{skipCloud:true});
    }
    if(Array.isArray(cloud.products)&&cloud.products.length){
      writeLocalMaster(PRODUCT_MASTER_LOCAL_KEY,mergeMasterRows(readLocalMaster(PRODUCT_MASTER_LOCAL_KEY,[]),cloud.products,'product'),{skipCloud:true});
    }
    masterCloudReady=true;
    refreshContactMasterDatalists?.();initProductMasterDatalist?.();renderMasterData?.();
    queueMasterCloudSync();
    return true;
  }catch(err){masterCloudReady=true;console.warn('โหลด Master Data ของบริษัทจาก Firebase ไม่สำเร็จ',err);return false;}
}
function productMasterRows(){
  const local=readLocalMaster(PRODUCT_MASTER_LOCAL_KEY,[]);
  const map=new Map();
  PRODUCT_MASTER.forEach((row,index)=>{
    const flowType=row.flowType||defaultProductFlowType(row);
    map.set(normalizeProductKey(row.code||row.name),{id:`seed-${index+1}`,...row,unit:row.unit||'ชิ้น',flowType,fulfillmentType:row.fulfillmentType||defaultProductFulfillment({...row,flowType}),openingStockUbon:safeNum(row.openingStockUbon??row.openingStock),openingStockKhonkaen:safeNum(row.openingStockKhonkaen),openingStock:safeNum(row.openingStockUbon??row.openingStock)+safeNum(row.openingStockKhonkaen),reorderPoint:safeNum(row.reorderPoint),standardCost:safeNum(row.standardCost),defaultSupplier:row.defaultSupplier||'',isSeed:true});
  });
  local.forEach(row=>{
    if(!row)return;const key=normalizeProductKey(row.code||row.name);if(!key)return;
    const base=map.get(key)||{};const flowType=row.flowType||base.flowType||defaultProductFlowType(row);
    map.set(key,{...base,...row,flowType,fulfillmentType:row.fulfillmentType||base.fulfillmentType||defaultProductFulfillment({...row,flowType}),unit:row.unit||base.unit||'ชิ้น',openingStockUbon:safeNum(row.openingStockUbon??row.openingStock??base.openingStockUbon??base.openingStock),openingStockKhonkaen:safeNum(row.openingStockKhonkaen??base.openingStockKhonkaen),openingStock:safeNum(row.openingStockUbon??row.openingStock??base.openingStockUbon??base.openingStock)+safeNum(row.openingStockKhonkaen??base.openingStockKhonkaen),reorderPoint:safeNum(row.reorderPoint??base.reorderPoint),standardCost:safeNum(row.standardCost??base.standardCost),isSeed:false});
  });
  return[...map.values()].sort((a,b)=>String(a.code||a.name).localeCompare(String(b.code||b.name),'th'));
}
function productMasterMeta(name='',code='',category=''){
  const key=normalizeProductKey(name),codeKey=String(code||'').trim().toLowerCase();
  const found=productMasterRows().find(x=>normalizeProductKey(x.name)===key || (codeKey&&String(x.code||'').toLowerCase()===codeKey));
  const flowType=found?.flowType||'non_inventory';
  return{productCode:code||found?.code||'',productCategory:category||found?.category||'อื่น ๆ',productName:String(name||found?.name||'').trim(),flowType,fulfillmentType:found?.fulfillmentType||defaultProductFulfillment({flowType}),unit:found?.unit||'',openingStock:safeNum(found?.openingStock),openingStockUbon:safeNum(found?.openingStockUbon??found?.openingStock),openingStockKhonkaen:safeNum(found?.openingStockKhonkaen),reorderPoint:safeNum(found?.reorderPoint),standardCost:safeNum(found?.standardCost),defaultSupplier:found?.defaultSupplier||''};
}
function enrichProductItem(item={}){
  const meta=productMasterMeta(item.product||item.name||'',item.productCode||item.code||'',item.productCategory||item.category||'');
  return{...item,product:meta.productName||item.product||item.name||'',productCode:meta.productCode,productCategory:meta.productCategory,flowType:item.flowType||meta.flowType,fulfillmentType:item.fulfillmentType||meta.fulfillmentType};
}
function initProductMasterDatalist(){
  let dl=document.getElementById('product-master-list');
  if(!dl){dl=document.createElement('datalist');dl.id='product-master-list';document.body.appendChild(dl);}
  dl.innerHTML=productMasterRows().map(x=>`<option value="${escapeHtml(x.name)}" label="${escapeHtml((x.code||'')+' · '+(x.category||'อื่น ๆ')+' · '+productFulfillmentLabel(x.fulfillmentType))}"></option>`).join('');
  populateAnalyticsProductFilter();
}
function applyProductMasterToInput(input){
  if(!input)return;
  const meta=productMasterMeta(input.value,input.dataset.productCode||'',input.dataset.productCategory||'');
  const exact=productMasterRows().find(x=>normalizeProductKey(x.name)===normalizeProductKey(input.value));
  if(exact){input.dataset.productCode=exact.code||'';input.dataset.productCategory=exact.category||'';input.dataset.flowType=exact.flowType||'';input.dataset.fulfillmentType=exact.fulfillmentType||'';input.title=`${exact.code||''} · ${exact.category||''} · ${productFulfillmentLabel(exact.fulfillmentType)}`;}
  else{input.dataset.productCode='';input.dataset.productCategory=meta.productCategory==='อื่น ๆ'?'':meta.productCategory;input.dataset.flowType=meta.flowType;input.dataset.fulfillmentType=meta.fulfillmentType;input.title='ชื่อสินค้าที่กรอกเอง · ค่าเริ่มต้น: ไม่นับสต็อก';}
  const note=input.closest('td')?.querySelector('.product-type-note');
  if(note){const flow=input.dataset.flowType||meta.flowType;const fulfillment=input.dataset.fulfillmentType||meta.fulfillmentType;const stockText=exact&&fulfillment==='stock'?` · คงเหลือประมาณ ${fmt(productEstimatedStock(exact))} ${exact.unit||''}`:'';note.textContent=`${productFlowTypeLabel(flow)} · ${productFulfillmentLabel(fulfillment)}${stockText}`;note.className=`product-type-note ${fulfillment==='stock'?'is-stock':fulfillment==='made_to_order'?'is-mto':'is-service'}`;}
}
function populateAnalyticsProductFilter(observed=[]){
  const el=document.getElementById('analytics-product');if(!el)return;
  const cur=el.value;
  const names=[...new Set([...productMasterRows().map(x=>x.name),...observed.filter(Boolean)])].sort((a,b)=>String(a).localeCompare(String(b),'th'));
  el.innerHTML='<option value="">สินค้าทั้งหมด</option>'+names.map(name=>{const m=productMasterMeta(name);return `<option value="${escapeHtml(name)}">${escapeHtml(name)}${m.productCode?' · '+escapeHtml(m.productCode):''}</option>`;}).join('');
  if(names.includes(cur))el.value=cur;else if(cur)el.value='';
}
function contactMasterRows(){return readLocalMaster(CONTACT_MASTER_KEY,[]).filter(Boolean).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'th'));}
function contactHasRole(row,role){return row?.role===role||row?.role==='both';}
function findContactMaster(name,role='customer'){
  const key=normalizeProductKey(name);if(!key)return null;
  return contactMasterRows().find(row=>normalizeProductKey(row.name)===key&&contactHasRole(row,role))||null;
}
function upsertContactMaster(record={}){
  const name=String(record.name||'').trim();if(!name)return null;
  const rows=contactMasterRows();
  const key=normalizeProductKey(name);const role=record.role||'customer';
  let index=record.id?rows.findIndex(row=>String(row.id)===String(record.id)):rows.findIndex(row=>normalizeProductKey(row.name)===key);
  const current=index>=0?rows[index]:{};
  let mergedRole=current.role||role;
  if(current.role&&current.role!==role&&current.role!=='both')mergedRole='both';
  const row={id:current.id||record.id||`contact-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,...current,...record,name,role:record.role==='both'?'both':mergedRole,updatedAt:new Date().toISOString(),createdAt:current.createdAt||new Date().toISOString()};
  if(index>=0)rows[index]=row;else rows.push(row);
  if(writeLocalMaster(CONTACT_MASTER_KEY,rows)){refreshContactMasterDatalists();renderMasterData();return row;}return null;
}
function refreshContactMasterDatalists(){
  const rows=contactMasterRows();
  const customers=rows.filter(r=>contactHasRole(r,'customer'));
  const suppliers=rows.filter(r=>contactHasRole(r,'supplier'));
  const c=document.getElementById('customer-master-list');if(c)c.innerHTML=customers.map(r=>`<option value="${escapeHtml(r.name)}" label="${escapeHtml([r.taxId,r.phone,r.address].filter(Boolean).join(' · '))}"></option>`).join('');
  const s=document.getElementById('supplier-master-list');if(s)s.innerHTML=suppliers.map(r=>`<option value="${escapeHtml(r.name)}" label="${escapeHtml([r.phone,r.supplierCreditTerm].filter(Boolean).join(' · '))}"></option>`).join('');
  populateProductionMakerDatalist?.();
}
function customerCreditDaysFromTerm(term=''){const map={cash:0,deposit50:0,credit30:30,credit60:60,credit90:90,credit120:120,credit150:150,credit180:180};return Object.prototype.hasOwnProperty.call(map,term)?map[term]:0;}
function customerCreditTermFromDays(days=0){const n=Number(days)||0;return n>=180?'credit180':n>=150?'credit150':n>=120?'credit120':n>=90?'credit90':n>=60?'credit60':n>=30?'credit30':n===0?'cash':'';}
function customerContactFromForm(prefix){
  const value=id=>document.getElementById(`${prefix}-${id}`)?.value?.trim?.()||'';
  const agency=getCustomerAgencyFromForm(prefix);
  const creditTerm=prefix==='i'?(document.getElementById('i-credit-term')?.value||''):'';
  return{name:value('cust'),role:'customer',entityType:'company',address:value('address'),taxId:value('tax-id'),contactPerson:value('contact'),phone:value('phone'),email:value('email'),creditDays:customerCreditDaysFromTerm(creditTerm),agencyGroup:agency.customerAgencyGroup||'',agencyType:agency.customerAgencyType||''};
}
function rememberCustomerFromForm(prefix,showNotice=false){
  const data=customerContactFromForm(prefix);if(!data.name)return null;
  const old=findContactMaster(data.name,'customer')||{};
  if(prefix!=='i'&&old.creditDays!==undefined)data.creditDays=old.creditDays;
  const row=upsertContactMaster({...old,...data,role:old.role==='supplier'||old.role==='both'?'both':'customer'});
  if(row&&showNotice)notify(`จำข้อมูลลูกค้า “${row.name}” ไว้ในเครื่องนี้แล้ว`);
  return row;
}
function applyCustomerMasterToForm(prefix,name=''){
  const input=document.getElementById(`${prefix}-cust`);const target=String(name||input?.value||'').trim();if(!target)return null;
  const row=findContactMaster(target,'customer');if(!row)return null;
  if(input){input.value=row.name;input.dataset.masterAppliedName=row.name;}
  const set=(id,val)=>{const el=document.getElementById(`${prefix}-${id}`);if(el&&val!==undefined&&val!==null)el.value=val;};
  set('address',row.address||'');set('tax-id',row.taxId||'');set('contact',row.contactPerson||'');set('phone',row.phone||'');set('email',row.email||'');
  if(row.agencyGroup||row.agencyType)applyCustomerAgencyToForm(prefix,{customerAgencyGroup:row.agencyGroup||'',customerAgencyType:row.agencyType||''});
  if(prefix==='i'&&safeNum(row.creditDays)>=0){const term=customerCreditTermFromDays(row.creditDays);if(term){setInputValue('i-credit-term',term);updateInvoiceDueDate?.();}}
  return row;
}
function handleCustomerMasterInput(prefix){
  const input=document.getElementById(`${prefix}-cust`);const name=input?.value||'';const row=findContactMaster(name,'customer');
  if(row){applyCustomerMasterToForm(prefix,name);return;}
  if(input?.dataset.masterAppliedName&&normalizeProductKey(input.dataset.masterAppliedName)!==normalizeProductKey(name)){
    ['address','tax-id','contact','phone','email'].forEach(id=>{const el=document.getElementById(`${prefix}-${id}`);if(el)el.value='';});delete input.dataset.masterAppliedName;
  }
}
function supplierContactFromProduction(){
  const value=id=>document.getElementById(id)?.value?.trim?.()||'';
  const leadRaw=document.getElementById('p-delivery-lead-days')?.value||'';
  return{name:value('p-maker'),role:'supplier',entityType:'company',address:value('p-maker-address'),taxId:value('p-maker-tax-id'),contactPerson:value('p-maker-contact'),phone:value('p-maker-phone'),email:value('p-maker-email'),supplierCreditTerm:document.getElementById('p-supplier-credit')?.value||'',supplierLeadDays:leadRaw?[Number(leadRaw)]:[]};
}
function rememberSupplierFromProduction(showNotice=false){
  const data=supplierContactFromProduction();if(!data.name)return null;
  const old=findContactMaster(data.name,'supplier')||{};
  const lead=[...new Set([...(old.supplierLeadDays||[]),...(data.supplierLeadDays||[])].map(Number).filter(Boolean))].sort((a,b)=>a-b);
  const row=upsertContactMaster({...old,...data,supplierLeadDays:lead,role:old.role==='customer'||old.role==='both'?'both':'supplier'});
  if(row&&showNotice)notify(`จำผู้จำหน่าย / ผู้ผลิต “${row.name}” ไว้ในเครื่องนี้แล้ว`);
  return row;
}
function applySupplierMasterToProduction(name=''){
  const maker=document.getElementById('p-maker');const target=String(name||maker?.value||'').trim();if(!target)return null;
  const row=findContactMaster(target,'supplier');
  if(!row){
    if(maker?.dataset.masterAppliedName&&normalizeProductKey(maker.dataset.masterAppliedName)!==normalizeProductKey(target)){
      ['p-maker-address','p-maker-tax-id','p-maker-contact','p-maker-phone','p-maker-email'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});delete maker.dataset.masterAppliedName;
    }
    return null;
  }
  if(maker)maker.dataset.masterAppliedName=row.name;
  const set=(id,val)=>{const el=document.getElementById(id);if(el&&val!==undefined&&val!==null)el.value=val;};
  set('p-maker-address',row.address||'');set('p-maker-tax-id',row.taxId||'');set('p-maker-contact',row.contactPerson||'');set('p-maker-phone',row.phone||'');set('p-maker-email',row.email||'');
  return row;
}
function switchMasterTab(name,button){
  document.querySelectorAll('.master-tab-panel').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.master-tabs button').forEach(x=>x.classList.remove('active'));
  document.getElementById(`master-tab-${name}`)?.classList.add('active');button?.classList.add('active');renderMasterData();
}
function masterTableHtml(columns,rows){
  if(!rows.length)return'<div class="empty">ยังไม่มีข้อมูลที่บันทึกไว้ในเครื่องนี้</div>';
  return `<div class="tbl-wrap master-table-wrap"><table class="master-table"><thead><tr>${columns.map(c=>`<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${columns.map(c=>`<td class="${c.cls||''}">${c.html?c.html(r):escapeHtml(r[c.key]??'-')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderMasterData(){
  const customers=contactMasterRows().filter(r=>contactHasRole(r,'customer'));
  const suppliers=contactMasterRows().filter(r=>contactHasRole(r,'supplier'));
  const products=productMasterRows();
  const cc=document.getElementById('master-customer-count');if(cc)cc.textContent=`${customers.length} ราย`;
  const sc=document.getElementById('master-supplier-count');if(sc)sc.textContent=`${suppliers.length} ราย`;
  const pc=document.getElementById('master-product-count');if(pc)pc.textContent=`${products.length} รายการ`;
  const ct=document.getElementById('master-customer-table');if(ct)ct.innerHTML=masterTableHtml([
    {label:'ลูกค้า',html:r=>`<b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.contactPerson||'')}</small>`},{label:'ที่อยู่',html:r=>escapeHtml(r.address||'-')},{label:'เลขผู้เสียภาษี',html:r=>escapeHtml(r.taxId||'-')},{label:'โทร / อีเมล',html:r=>`${escapeHtml(r.phone||'-')}<br><small>${escapeHtml(r.email||'')}</small>`},{label:'จัดการ',html:r=>`<button class="btn btn-view btn-sm" onclick="editContactMaster('${r.id}','customer')">แก้ไข</button> <button class="btn btn-danger btn-sm" onclick="deleteContactMaster('${r.id}')">ลบ</button>`}
  ],customers);
  const st=document.getElementById('master-supplier-table');if(st)st.innerHTML=masterTableHtml([
    {label:'ผู้จำหน่าย / ผู้ผลิต',html:r=>`<b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.contactPerson||'')}</small>`},{label:'ที่อยู่',html:r=>escapeHtml(r.address||'-')},{label:'เครดิต',html:r=>escapeHtml(r.supplierCreditTerm||'-')},{label:'ระยะส่ง',html:r=>(r.supplierLeadDays||[]).length?escapeHtml(r.supplierLeadDays.join(', ')+' วัน'):'-'},{label:'ติดต่อ',html:r=>`${escapeHtml(r.phone||'-')}<br><small>${escapeHtml(r.email||'')}</small>`},{label:'จัดการ',html:r=>`<button class="btn btn-view btn-sm" onclick="editContactMaster('${r.id}','supplier')">แก้ไข</button> <button class="btn btn-danger btn-sm" onclick="deleteContactMaster('${r.id}')">ลบ</button>`}
  ],suppliers);
  const pt=document.getElementById('master-product-table');if(pt)pt.innerHTML=masterTableHtml([
    {label:'SKU / สินค้า',html:r=>`<b>${escapeHtml(r.code||'-')}</b><br>${escapeHtml(r.name||'-')}<small>${escapeHtml(r.category||'')}</small>`},{label:'ประเภท',html:r=>productFlowTypeBadge(r.flowType)},{label:'รูปแบบงาน',html:r=>productFulfillmentBadge(r.fulfillmentType)},{label:'Opening HQ',html:r=>fmt(r.openingStockUbon||0),cls:'tn'},{label:'Opening 00001',html:r=>fmt(r.openingStockKhonkaen||0),cls:'tn'},{label:'ขายออก',html:r=>fmt(productSoldQty(r)),cls:'tn'},{label:'คงเหลือ',html:r=>{const q=productEstimatedStock(r);const cls=q<=safeNum(r.reorderPoint)?'neg':'pos';return r.fulfillmentType==='stock'?`<b class="${cls}">${fmt(q)}</b>`:'—';},cls:'tn'},{label:'ต้นทุนมาตรฐาน',html:r=>r.standardCost?`฿${fmt(r.standardCost)}`:'-',cls:'tn'},{label:'ผู้จำหน่ายหลัก',html:r=>escapeHtml(r.defaultSupplier||'-')},{label:'จัดการ',html:r=>{const key=encodeURIComponent(r.code||r.name||'');return `<button class="btn btn-view btn-sm" onclick="editProductMasterLocal(decodeURIComponent('${key}'))">แก้ไข</button> ${r.isSeed?'':`<button class="btn btn-danger btn-sm" onclick="deleteProductMasterLocal(decodeURIComponent('${key}'))">ลบ</button>`}`;}}
  ],products);
}
function productFlowTypeLabel(v){return{inventory:'Inventory · นับสต็อก',non_inventory:'Non-Inventory · ไม่นับสต็อก',service:'Service · บริการ'}[v]||v||'-';}
function productFulfillmentLabel(v){return{stock:'สินค้าในสต็อก',made_to_order:'สินค้าสั่งผลิต / สั่งซื้อเฉพาะงาน',service:'บริการ'}[v]||v||'-';}
function productFlowTypeBadge(v){const cls=v==='inventory'?'b-green':v==='service'?'b-purple':'b-blue';return`<span class="badge ${cls}">${escapeHtml(productFlowTypeLabel(v))}</span>`;}
function productFulfillmentBadge(v){const cls=v==='stock'?'b-green':v==='made_to_order'?'b-amber':'b-purple';return`<span class="badge ${cls}">${escapeHtml(productFulfillmentLabel(v))}</span>`;}
function productSoldQty(product,branch=''){
  const targetCode=normalizeProductKey(product.code),targetName=normalizeProductKey(product.name);let qty=0;
  const years=typeof allYears==='function'?allYears():[now.getFullYear()];
  const branches=branch?[branch]:tenantActiveBranchIds();
  branches.forEach(br=>years.forEach(year=>{for(let month=0;month<12;month++){const pack=loadFor(br,year,month);(pack.invoices||[]).filter(inv=>!inv.voided&&!inv.cancelled).forEach(inv=>(inv.items||[]).forEach(item=>{const code=normalizeProductKey(item.productCode),name=normalizeProductKey(item.product);if((targetCode&&code===targetCode)||(!targetCode&&name===targetName)||(targetName&&name===targetName))qty+=safeNum(item.qty);}));}}));
  return roundMoneyValue(qty);
}
function productOpeningStock(product,branch=''){
  const ub=safeNum(product.openingStockUbon??product.openingStock),kk=safeNum(product.openingStockKhonkaen);
  return branch==='ubon'?ub:branch==='khonkaen'?kk:ub+kk;
}
function productEstimatedStock(product,branch=''){
  const external=window.ERPProductionCore?.inventoryMovementNet;
  const movement=typeof external==='function'?safeNum(external(product,branch)):0;
  return roundMoneyValue(productOpeningStock(product,branch)+movement-productSoldQty(product,branch));
}
function syncProductFulfillmentFromFlowType(){const flow=document.getElementById('md-p-flow-type')?.value;const f=document.getElementById('md-p-fulfillment');if(!f)return;if(flow==='service')f.value='service';else if(flow==='inventory'&&f.value==='service')f.value='stock';else if(flow==='non_inventory'&&f.value==='service')f.value='made_to_order';}
function resetCustomerMasterForm(){masterEditState.customer='';['md-c-name','md-c-tax','md-c-branch-name','md-c-branch-code','md-c-address','md-c-postal','md-c-contact','md-c-phone','md-c-email','md-c-credit','md-c-note'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});setInputValue('md-c-entity','company');setInputValue('md-c-role','customer');}
function resetSupplierMasterForm(){masterEditState.supplier='';['md-s-name','md-s-tax','md-s-address','md-s-contact','md-s-phone','md-s-email','md-s-lead','md-s-note'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});setInputValue('md-s-entity','company');setInputValue('md-s-role','supplier');setInputValue('md-s-credit','cash');}
function resetProductMasterForm(){masterEditState.product='';['md-p-code','md-p-name','md-p-category','md-p-opening','md-p-opening-ub','md-p-opening-kk','md-p-standard-cost','md-p-reorder','md-p-supplier'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});setInputValue('md-p-flow-type','inventory');setInputValue('md-p-fulfillment','stock');setInputValue('md-p-unit','กล่อง');}
function saveCustomerMaster(){const v=id=>document.getElementById(id)?.value?.trim?.()||'';const name=v('md-c-name');if(!name)return notify('กรุณากรอกชื่อลูกค้า');upsertContactMaster({id:masterEditState.customer||'',name,role:document.getElementById('md-c-role')?.value||'customer',entityType:document.getElementById('md-c-entity')?.value||'company',taxId:v('md-c-tax'),branchName:v('md-c-branch-name'),branchCode:v('md-c-branch-code'),address:v('md-c-address'),postalCode:v('md-c-postal'),contactPerson:v('md-c-contact'),phone:v('md-c-phone'),email:v('md-c-email'),creditDays:safeNum(v('md-c-credit')),note:v('md-c-note')});resetCustomerMasterForm();notify('บันทึกลูกค้าแล้ว และจะ Sync กับ Firebase ของบริษัทเมื่อเชื่อม Cloud','success');}
function saveSupplierMaster(){const v=id=>document.getElementById(id)?.value?.trim?.()||'';const name=v('md-s-name');if(!name)return notify('กรุณากรอกชื่อผู้จำหน่าย / ผู้ผลิต');const lead=v('md-s-lead').split(',').map(x=>Number(x.trim())).filter(x=>x>0);upsertContactMaster({id:masterEditState.supplier||'',name,role:document.getElementById('md-s-role')?.value||'supplier',entityType:document.getElementById('md-s-entity')?.value||'company',taxId:v('md-s-tax'),address:v('md-s-address'),contactPerson:v('md-s-contact'),phone:v('md-s-phone'),email:v('md-s-email'),supplierCreditTerm:document.getElementById('md-s-credit')?.value||'cash',supplierLeadDays:lead,note:v('md-s-note')});resetSupplierMasterForm();notify('บันทึกผู้จำหน่าย / ผู้ผลิตแล้ว และจะ Sync กับ Firebase ของบริษัทเมื่อเชื่อม Cloud','success');}
function saveProductMasterLocal(){const v=id=>document.getElementById(id)?.value?.trim?.()||'';const code=v('md-p-code'),name=v('md-p-name');if(!code||!name)return notify('กรุณากรอกรหัสสินค้าและชื่อสินค้า');const rows=readLocalMaster(PRODUCT_MASTER_LOCAL_KEY,[]);const key=normalizeProductKey(masterEditState.product||code);const idx=rows.findIndex(r=>normalizeProductKey(r.code||r.name)===key);const openingStockUbon=safeNum(v('md-p-opening-ub')||v('md-p-opening')),openingStockKhonkaen=safeNum(v('md-p-opening-kk'));const row={id:idx>=0?rows[idx].id:`product-${Date.now()}`,code,name,category:v('md-p-category')||'อื่น ๆ',unit:document.getElementById('md-p-unit')?.value||'ชิ้น',flowType:document.getElementById('md-p-flow-type')?.value||'inventory',fulfillmentType:document.getElementById('md-p-fulfillment')?.value||'stock',openingStockUbon,openingStockKhonkaen,openingStock:openingStockUbon+openingStockKhonkaen,reorderPoint:safeNum(v('md-p-reorder')),standardCost:safeNum(v('md-p-standard-cost')),defaultSupplier:v('md-p-supplier'),updatedAt:new Date().toISOString()};if(idx>=0)rows[idx]={...rows[idx],...row};else rows.push(row);writeLocalMaster(PRODUCT_MASTER_LOCAL_KEY,rows);window.ERPProductionCore?.audit?.(idx>=0?'update':'create','product',code,`${idx>=0?'แก้ไข':'บันทึก'} Product Master: ${name}`);resetProductMasterForm();initProductMasterDatalist();renderMasterData();notify('บันทึก Product Master แล้ว และจะ Sync กับ Firebase ของบริษัทเมื่อเชื่อม Cloud','success');}
function editContactMaster(id,mode){const row=contactMasterRows().find(r=>String(r.id)===String(id));if(!row)return;if(mode==='customer'){masterEditState.customer=row.id;setInputValue('md-c-name',row.name);setInputValue('md-c-entity',row.entityType||'company');setInputValue('md-c-role',row.role==='both'?'both':'customer');setInputValue('md-c-tax',row.taxId);setInputValue('md-c-branch-name',row.branchName);setInputValue('md-c-branch-code',row.branchCode);setInputValue('md-c-address',row.address);setInputValue('md-c-postal',row.postalCode);setInputValue('md-c-contact',row.contactPerson);setInputValue('md-c-phone',row.phone);setInputValue('md-c-email',row.email);setInputValue('md-c-credit',row.creditDays);setInputValue('md-c-note',row.note);}else{masterEditState.supplier=row.id;setInputValue('md-s-name',row.name);setInputValue('md-s-entity',row.entityType||'company');setInputValue('md-s-role',row.role==='both'?'both':'supplier');setInputValue('md-s-tax',row.taxId);setInputValue('md-s-address',row.address);setInputValue('md-s-contact',row.contactPerson);setInputValue('md-s-phone',row.phone);setInputValue('md-s-email',row.email);setInputValue('md-s-credit',row.supplierCreditTerm||'cash');setInputValue('md-s-lead',(row.supplierLeadDays||[]).join(','));setInputValue('md-s-note',row.note);}}
function deleteContactMaster(id){if(!confirm('ลบข้อมูลผู้ติดต่อนี้ใช่หรือไม่?'))return;const rows=contactMasterRows(),target=rows.find(r=>String(r.id)===String(id));writeLocalMaster(CONTACT_MASTER_KEY,rows.filter(r=>String(r.id)!==String(id)));if(target&&window.FirebaseService?.deleteMasterRecord)window.FirebaseService.deleteMasterRecord('contact',target).catch(err=>console.warn('ลบ Contact Master บน Firebase ไม่สำเร็จ',err));refreshContactMasterDatalists();renderMasterData();}
function editProductMasterLocal(code){const row=productMasterRows().find(r=>normalizeProductKey(r.code||r.name)===normalizeProductKey(code));if(!row)return;masterEditState.product=row.code||row.name;setInputValue('md-p-code',row.code);setInputValue('md-p-name',row.name);setInputValue('md-p-category',row.category);setInputValue('md-p-unit',row.unit||'ชิ้น');setInputValue('md-p-flow-type',row.flowType);setInputValue('md-p-fulfillment',row.fulfillmentType);setInputValue('md-p-opening-ub',row.openingStockUbon??row.openingStock);setInputValue('md-p-opening-kk',row.openingStockKhonkaen||0);setInputValue('md-p-standard-cost',row.standardCost||0);setInputValue('md-p-reorder',row.reorderPoint);setInputValue('md-p-supplier',row.defaultSupplier);}
function deleteProductMasterLocal(code){if(!confirm('ลบ Product Master นี้ใช่หรือไม่?'))return;const all=readLocalMaster(PRODUCT_MASTER_LOCAL_KEY,[]),target=all.find(r=>normalizeProductKey(r.code||r.name)===normalizeProductKey(code));const rows=all.filter(r=>normalizeProductKey(r.code||r.name)!==normalizeProductKey(code));writeLocalMaster(PRODUCT_MASTER_LOCAL_KEY,rows);if(target&&window.FirebaseService?.deleteMasterRecord)window.FirebaseService.deleteMasterRecord('product',target).catch(err=>console.warn('ลบ Product Master บน Firebase ไม่สำเร็จ',err));initProductMasterDatalist();renderMasterData();}
function initMasterData(){
  const unit=document.getElementById('md-p-unit');if(unit)unit.innerHTML=UNITS.map(u=>`<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');
  // Seed supplier names from the production presets without inventing addresses.
  const existing=contactMasterRows();if(!existing.some(r=>contactHasRole(r,'supplier'))&&typeof PRODUCTION_MAKER_PRESETS!=='undefined'){
    const seeds=PRODUCTION_MAKER_PRESETS.map((p,i)=>({id:`supplier-seed-${i+1}`,name:p.name,role:'supplier',entityType:'company',address:'',taxId:'',contactPerson:'',phone:'',email:'',supplierCreditTerm:p.supplierCreditTerm,supplierLeadDays:p.leadDays||[],note:p.note||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));writeLocalMaster(CONTACT_MASTER_KEY,[...existing,...seeds]);
  }
  refreshContactMasterDatalists();renderMasterData();
}

const CUSTOMER_AGENCY_GROUPS=[
  {value:'government',label:'ราชการ / หน่วยงานรัฐ'},
  {value:'state_enterprise',label:'รัฐวิสาหกิจ / สถาบันการเงินของรัฐ'},
  {value:'hospital',label:'โรงพยาบาล'},
  {value:'school',label:'โรงเรียน'},
  {value:'private_company',label:'บริษัทเอกชน'},
  {value:'other',label:'อื่น ๆ / ไม่ระบุ'}
];
const CUSTOMER_AGENCY_TYPES=[
  // ราชการ / หน่วยงานรัฐทั่วไป
  {value:'government_agency',group:'government',label:'หน่วยงานราชการทั่วไป',prefix:'',patterns:['กระทรวง','กรม','สำนักงานจังหวัด','องค์การบริหารส่วนจังหวัด','องค์การบริหารส่วนตำบล','เทศบาล']},
  {value:'savings_cooperative',group:'government',label:'สหกรณ์ออมทรัพย์',prefix:'สอ.',patterns:['สอ.','สอ','สหกรณ์ออมทรัพย์']},
  {value:'agricultural_cooperative',group:'government',label:'สหกรณ์การเกษตร',prefix:'สกก.',patterns:['สกก.','สกก','สหกรณ์การเกษตร']},
  {value:'funeral_association',group:'government',label:'สมาคมฌาปนกิจสงเคราะห์',prefix:'สมาคมฯ',patterns:['สมาคมฯ','สมาคมฌาปนกิจ','สมาคมฌาปนกิจสงเคราะห์']},
  {value:'police',group:'government',label:'สำนักงานตำรวจแห่งชาติ',prefix:'ตร.',patterns:['ตร.','สำนักงานตำรวจแห่งชาติ']},
  {value:'nacc',group:'government',label:'สำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตแห่งชาติ',prefix:'ป.ป.ช.',patterns:['ป.ป.ช.','ปปช','สำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตแห่งชาติ']},
  {value:'oncb',group:'government',label:'สำนักงานคณะกรรมการป้องกันและปราบปรามยาเสพติด',prefix:'ป.ป.ส.',patterns:['ป.ป.ส.','ปปส','สำนักงานคณะกรรมการป้องกันและปราบปรามยาเสพติด']},
  {value:'amlo',group:'government',label:'สำนักงานป้องกันและปราบปรามการฟอกเงิน',prefix:'ปปง.',patterns:['ปปง.','ปปง','สำนักงานป้องกันและปราบปรามการฟอกเงิน']},
  {value:'immigration',group:'government',label:'สำนักงานตรวจคนเข้าเมือง',prefix:'สตม.',patterns:['สตม.','สตม','สำนักงานตรวจคนเข้าเมือง']},
  {value:'sso',group:'government',label:'สำนักงานประกันสังคม',prefix:'สปส.',patterns:['สปส.','สำนักงานประกันสังคม']},
  {value:'nhso',group:'government',label:'สำนักงานหลักประกันสุขภาพแห่งชาติ',prefix:'สปสช.',patterns:['สปสช.','สำนักงานหลักประกันสุขภาพแห่งชาติ']},
  {value:'thaihealth',group:'government',label:'สำนักงานกองทุนสนับสนุนการสร้างเสริมสุขภาพ',prefix:'สสส.',patterns:['สสส.','สำนักงานกองทุนสนับสนุนการสร้างเสริมสุขภาพ']},
  {value:'fda',group:'government',label:'สำนักงานคณะกรรมการอาหารและยา',prefix:'อย.',patterns:['อย.','สำนักงานคณะกรรมการอาหารและยา']},
  {value:'bot',group:'government',label:'ธนาคารแห่งประเทศไทย',prefix:'ธปท.',patterns:['ธปท.','ธนาคารแห่งประเทศไทย','แบงก์ชาติ']},
  {value:'oic',group:'government',label:'สำนักงาน คปภ.',prefix:'คปภ.',patterns:['คปภ.','สำนักงานคณะกรรมการกำกับและส่งเสริมการประกอบธุรกิจประกันภัย']},
  {value:'pmuc',group:'government',label:'บพข.',prefix:'บพข.',patterns:['บพข.','หน่วยบริหารและจัดการทุนด้านการเพิ่มความสามารถในการแข่งขันของประเทศ']},
  {value:'obec',group:'government',label:'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน',prefix:'สพฐ.',patterns:['สพฐ.','สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน']},
  {value:'onec',group:'government',label:'สำนักงานเลขาธิการสภาการศึกษา',prefix:'สกศ.',patterns:['สกศ.','สำนักงานเลขาธิการสภาการศึกษา']},
  {value:'nrct',group:'government',label:'สำนักงานการวิจัยแห่งชาติ',prefix:'วช.',patterns:['วช.','สำนักงานการวิจัยแห่งชาติ']},
  {value:'nstda',group:'government',label:'สำนักงานพัฒนาวิทยาศาสตร์และเทคโนโลยีแห่งชาติ',prefix:'สวทช.',patterns:['สวทช.','สำนักงานพัฒนาวิทยาศาสตร์และเทคโนโลยีแห่งชาติ']},

  // รัฐวิสาหกิจ / สถาบันการเงินของรัฐ
  {value:'egat',group:'state_enterprise',label:'การไฟฟ้าฝ่ายผลิตแห่งประเทศไทย',prefix:'กฟผ.',patterns:['กฟผ.','การไฟฟ้าฝ่ายผลิตแห่งประเทศไทย']},
  {value:'pea',group:'state_enterprise',label:'การไฟฟ้าส่วนภูมิภาค',prefix:'กฟภ.',patterns:['กฟภ.','การไฟฟ้าส่วนภูมิภาค']},
  {value:'mea',group:'state_enterprise',label:'การไฟฟ้านครหลวง',prefix:'กฟน.',patterns:['กฟน.','การไฟฟ้านครหลวง']},
  {value:'pwa',group:'state_enterprise',label:'การประปาส่วนภูมิภาค',prefix:'กปภ.',patterns:['กปภ.','การประปาส่วนภูมิภาค']},
  {value:'mwa',group:'state_enterprise',label:'การประปานครหลวง',prefix:'กปน.',patterns:['กปน.','การประปานครหลวง']},
  {value:'bmta',group:'state_enterprise',label:'องค์การขนส่งมวลชนกรุงเทพ',prefix:'ขสมก.',patterns:['ขสมก.','องค์การขนส่งมวลชนกรุงเทพ']},
  {value:'srt',group:'state_enterprise',label:'การรถไฟแห่งประเทศไทย',prefix:'รฟท.',patterns:['รฟท.','การรถไฟแห่งประเทศไทย']},
  {value:'tcg',group:'state_enterprise',label:'บรรษัทประกันสินเชื่ออุตสาหกรรมขนาดย่อม',prefix:'บ.ส.ย.',patterns:['บ.ส.ย.','บสย.','บรรษัทประกันสินเชื่ออุตสาหกรรมขนาดย่อม']},
  {value:'zpo',group:'state_enterprise',label:'องค์การสวนสัตว์แห่งประเทศไทย ในพระบรมราชูปถัมภ์',prefix:'อสส.',patterns:['อสส.','องค์การสวนสัตว์แห่งประเทศไทย']},
  {value:'baac',group:'state_enterprise',label:'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร',prefix:'ธ.ก.ส.',patterns:['ธ.ก.ส.','ธกส.','ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร']},
  {value:'ghb',group:'state_enterprise',label:'ธนาคารอาคารสงเคราะห์',prefix:'ธอส.',patterns:['ธอส.','ธนาคารอาคารสงเคราะห์']},
  {value:'smebank',group:'state_enterprise',label:'ธนาคารพัฒนาวิสาหกิจขนาดกลางและขนาดย่อมแห่งประเทศไทย',prefix:'ธพว.',patterns:['ธพว.','SME Bank','ธนาคารพัฒนาวิสาหกิจขนาดกลางและขนาดย่อมแห่งประเทศไทย']},
  {value:'exim',group:'state_enterprise',label:'ธนาคารเพื่อการส่งออกและนำเข้าแห่งประเทศไทย',prefix:'ธสน.',patterns:['ธสน.','EXIM Bank','ธนาคารเพื่อการส่งออกและนำเข้าแห่งประเทศไทย']},
  {value:'eta',group:'state_enterprise',label:'การทางพิเศษแห่งประเทศไทย',prefix:'กทพ.',patterns:['กทพ.','การทางพิเศษแห่งประเทศไทย']},
  {value:'mrta',group:'state_enterprise',label:'การรถไฟฟ้าขนส่งมวลชนแห่งประเทศไทย',prefix:'รฟม.',patterns:['รฟม.','การรถไฟฟ้าขนส่งมวลชนแห่งประเทศไทย']},
  {value:'aerothai',group:'state_enterprise',label:'บริษัท วิทยุการบินแห่งประเทศไทย จำกัด',prefix:'บวท.',patterns:['บวท.','วิทยุการบินแห่งประเทศไทย']},
  {value:'aot',group:'state_enterprise',label:'บริษัท ท่าอากาศยานไทย จำกัด (มหาชน)',prefix:'ทอท.',patterns:['ทอท.','ท่าอากาศยานไทย','AOT']},
  {value:'transport',group:'state_enterprise',label:'บริษัท ขนส่ง จำกัด',prefix:'บขส.',patterns:['บขส.','บริษัท ขนส่ง จำกัด']},
  {value:'ptt',group:'state_enterprise',label:'บริษัท ปตท. จำกัด (มหาชน)',prefix:'ปตท.',patterns:['ปตท.','บริษัท ปตท.','PTT']},
  {value:'nha',group:'state_enterprise',label:'การเคหะแห่งชาติ',prefix:'กคช.',patterns:['กคช.','การเคหะแห่งชาติ']},
  {value:'pwo',group:'state_enterprise',label:'องค์การคลังสินค้า',prefix:'อคส.',patterns:['อคส.','องค์การคลังสินค้า']},
  {value:'dpo',group:'state_enterprise',label:'องค์การส่งเสริมกิจการโคนมแห่งประเทศไทย',prefix:'อ.ส.ค.',patterns:['อ.ส.ค.','องค์การส่งเสริมกิจการโคนมแห่งประเทศไทย']},
  {value:'toat',group:'state_enterprise',label:'การยาสูบแห่งประเทศไทย',prefix:'ยสท.',patterns:['ยสท.','การยาสูบแห่งประเทศไทย']},
  {value:'fio',group:'state_enterprise',label:'องค์การอุตสาหกรรมป่าไม้',prefix:'อ.อ.ป.',patterns:['อ.อ.ป.','องค์การอุตสาหกรรมป่าไม้']},

  // กลุ่มหลักอื่น ๆ
  {value:'hospital',group:'hospital',label:'โรงพยาบาล',prefix:'รพ.',patterns:['รพ.','รพ','โรงพยาบาล']},
  {value:'school',group:'school',label:'โรงเรียน',prefix:'รร.',patterns:['รร.','รร','โรงเรียน']},
  {value:'limited_partnership',group:'private_company',label:'ห้างหุ้นส่วนจำกัด',prefix:'หจก.',patterns:['หจก.','หจก','ห้างหุ้นส่วนจำกัด']},
  {value:'limited_company',group:'private_company',label:'บริษัทจำกัด',prefix:'บจก.',patterns:['บจก.','บจก','บริษัทจำกัด','บริษัท จำกัด']},
  {value:'public_company',group:'private_company',label:'บริษัทมหาชนจำกัด',prefix:'บมจ.',patterns:['บมจ.','บริษัทมหาชนจำกัด','บริษัท มหาชน จำกัด']},
  {value:'other',group:'other',label:'อื่น ๆ / ไม่ระบุ',prefix:'',patterns:[]}
];

const CUSTOMER_DEMO_MASTER=[
  {name:'สำนักงานตำรวจแห่งชาติ (ตร.)',group:'government',type:'police'},
  {name:'สำนักงานประกันสังคม (สปส.)',group:'government',type:'sso'},
  {name:'สำนักงานหลักประกันสุขภาพแห่งชาติ (สปสช.)',group:'government',type:'nhso'},
  {name:'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)',group:'government',type:'obec'},
  {name:'สำนักงานการวิจัยแห่งชาติ (วช.)',group:'government',type:'nrct'},
  {name:'สอ.ข้าราชการจังหวัดตัวอย่าง จำกัด',group:'government',type:'savings_cooperative'},
  {name:'สกก.เมืองตัวอย่าง จำกัด',group:'government',type:'agricultural_cooperative'},
  {name:'สมาคมฯ ฌาปนกิจสงเคราะห์ตัวอย่าง',group:'government',type:'funeral_association'},

  {name:'การไฟฟ้าฝ่ายผลิตแห่งประเทศไทย (กฟผ.)',group:'state_enterprise',type:'egat'},
  {name:'การไฟฟ้าส่วนภูมิภาค (กฟภ.)',group:'state_enterprise',type:'pea'},
  {name:'การไฟฟ้านครหลวง (กฟน.)',group:'state_enterprise',type:'mea'},
  {name:'การประปาส่วนภูมิภาค (กปภ.)',group:'state_enterprise',type:'pwa'},
  {name:'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)',group:'state_enterprise',type:'baac'},
  {name:'ธนาคารอาคารสงเคราะห์ (ธอส.)',group:'state_enterprise',type:'ghb'},
  {name:'การรถไฟแห่งประเทศไทย (รฟท.)',group:'state_enterprise',type:'srt'},
  {name:'บริษัท ท่าอากาศยานไทย จำกัด (มหาชน) (ทอท.)',group:'state_enterprise',type:'aot'},
  {name:'บริษัท ปตท. จำกัด (มหาชน) (ปตท.)',group:'state_enterprise',type:'ptt'},

  {name:'รพ.ตัวอย่าง ศูนย์การแพทย์จังหวัดขอนแก่น',group:'hospital',type:'hospital'},
  {name:'โรงพยาบาลตัวอย่าง เมืองอุบลราชธานี',group:'hospital',type:'hospital'},
  {name:'รพ.ส่งเสริมสุขภาพตำบลตัวอย่าง',group:'hospital',type:'hospital'},

  {name:'รร.ตัวอย่างวิทยา',group:'school',type:'school'},
  {name:'โรงเรียนตัวอย่างพิทยาคม',group:'school',type:'school'},
  {name:'รร.สาธิตตัวอย่าง',group:'school',type:'school'},

  {name:'บจก. ตัวอย่าง ดิจิทัล จำกัด',group:'private_company',type:'limited_company'},
  {name:'บจก. ตัวอย่าง ซัพพลาย จำกัด',group:'private_company',type:'limited_company'},
  {name:'หจก. ตัวอย่าง การค้า',group:'private_company',type:'limited_partnership'},
  {name:'บมจ. ตัวอย่าง เทคโนโลยี',group:'private_company',type:'public_company'}
];
function agencyGroupLabel(value){return CUSTOMER_AGENCY_GROUPS.find(x=>x.value===value)?.label||'อื่น ๆ / ไม่ระบุ';}
function agencyTypeMeta(value){return CUSTOMER_AGENCY_TYPES.find(x=>x.value===value)||CUSTOMER_AGENCY_TYPES.find(x=>x.value==='other');}
function normalizeThaiSearchText(value){
  return String(value||'').toLowerCase().replace(/\s+/g,'').replace(/[()（）]/g,'').trim();
}
function customerNameMatchesAgencyPattern(name,pattern){
  const n=normalizeThaiSearchText(name),p=normalizeThaiSearchText(pattern);
  if(!n||!p)return false;
  if(p.length<=4)return n.startsWith(p);
  return n.includes(p);
}
function inferCustomerAgency(name=''){
  const clean=String(name||'').trim();
  for(const item of CUSTOMER_AGENCY_TYPES.filter(x=>x.value!=='other')){
    if((item.patterns||[]).some(pattern=>customerNameMatchesAgencyPattern(clean,pattern))){
      return{
        customerAgencyGroup:item.group,
        customerAgencyGroupLabel:agencyGroupLabel(item.group),
        customerAgencyType:item.value,
        customerAgencyTypeLabel:item.label,
        customerPrefix:item.prefix,
        customerAgencyDetectedFrom:'customer-name-prefix',
        customerAgencyConfidence:'auto'
      };
    }
  }
  return{
    customerAgencyGroup:'other',
    customerAgencyGroupLabel:agencyGroupLabel('other'),
    customerAgencyType:'other',
    customerAgencyTypeLabel:agencyTypeMeta('other').label,
    customerPrefix:'',
    customerAgencyDetectedFrom:clean?'manual-required':'empty-customer',
    customerAgencyConfidence:'unknown'
  };
}

function customerDemoOptionLabel(item){
  const type=agencyTypeMeta(item.type);
  return `${item.name} — ${agencyGroupLabel(item.group)}${type?.label?` / ${type.label}`:''}`;
}
function customerDemoOptionsHtml(){
  return CUSTOMER_AGENCY_GROUPS.filter(g=>g.value!=='other').map(group=>{
    const rows=CUSTOMER_DEMO_MASTER.filter(item=>item.group===group.value);
    if(!rows.length)return'';
    return `<optgroup label="${escapeHtml(group.label)}">${rows.map((item,index)=>`<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join('')}</optgroup>`;
  }).join('');
}
function applyCustomerDemo(prefix,name=''){
  const demo=CUSTOMER_DEMO_MASTER.find(item=>item.name===name);
  if(!demo)return;
  const input=document.getElementById(prefix+'-cust');
  if(input)input.value=demo.name;
  applyCustomerAgencyToForm(prefix,{
    customer:demo.name,
    customerAgencyGroup:demo.group,
    customerAgencyType:demo.type,
    customerAgencyDetectedFrom:'demo-master',
    customerAgencyConfidence:'classified'
  });
  const select=document.getElementById(prefix+'-customer-demo');
  if(select)select.value=demo.name;
  if(typeof scheduleInlineDocumentPreview==='function')scheduleInlineDocumentPreview(prefix);
}
function initCustomerDemoMaster(){
  let list=document.getElementById('customer-demo-master-list');
  if(!list){
    list=document.createElement('datalist');
    list.id='customer-demo-master-list';
    list.innerHTML=CUSTOMER_DEMO_MASTER.map(item=>`<option value="${escapeHtml(item.name)}">${escapeHtml(customerDemoOptionLabel(item))}</option>`).join('');
    document.body.appendChild(list);
  }
  ['q','i','r','p'].forEach(prefix=>{
    const customerInput=document.getElementById(prefix+'-cust');
    const typeSelect=document.getElementById(prefix+'-agency-type');
    if(!customerInput||!typeSelect)return;
    customerInput.setAttribute('list','customer-demo-master-list');
    customerInput.setAttribute('autocomplete','off');
    if(document.getElementById(prefix+'-customer-demo'))return;
    const box=document.createElement('div');
    box.className='ff customer-demo-field';
    box.innerHTML=`<label>เลือกข้อมูล Demo / ตัวช่วยกรอก</label><select id="${prefix}-customer-demo"><option value="">-- เลือกลูกค้าตัวอย่าง --</option>${customerDemoOptionsHtml()}</select><small class="section-hint">เลือกแล้วระบบจะเติมชื่อและประเภทหน่วยงานให้อัตโนมัติ</small>`;
    typeSelect.closest('.ff')?.insertAdjacentElement('afterend',box);
    box.querySelector('select')?.addEventListener('change',event=>applyCustomerDemo(prefix,event.target.value));
  });
}

function getCustomerNameForForm(prefix){return document.getElementById(prefix+'-cust')?.value||'';}
function populateCustomerAgencyGroupOptions(prefix){
  const el=document.getElementById(prefix+'-agency-group');if(!el)return;
  const cur=el.value;
  el.innerHTML=CUSTOMER_AGENCY_GROUPS.map(g=>`<option value="${g.value}">${escapeHtml(g.label)}</option>`).join('');
  el.value=cur||'';
}
function populateCustomerAgencyTypeOptions(prefix){
  const groupEl=document.getElementById(prefix+'-agency-group');
  const typeEl=document.getElementById(prefix+'-agency-type');if(!typeEl)return;
  const group=groupEl?.value||'other';
  const cur=typeEl.value;
  const list=CUSTOMER_AGENCY_TYPES.filter(t=>t.group===group || (group==='other'&&t.value==='other'));
  typeEl.innerHTML=list.map(t=>`<option value="${t.value}">${escapeHtml(t.label)}</option>`).join('');
  typeEl.value=list.some(t=>t.value===cur)?cur:(list[0]?.value||'other');
}
function renderCustomerAgencyHint(prefix){
  const hint=document.getElementById(prefix+'-agency-hint');if(!hint)return;
  const meta=getCustomerAgencyFromForm(prefix);
  const prefixText=meta.customerPrefix?` · คำย่อ: ${escapeHtml(meta.customerPrefix)}`:'';
  const detectText=meta.customerAgencyDetectedFrom==='manual'?'เลือกเอง':'เดาจากชื่อลูกค้า';
  hint.innerHTML=`${detectText}: <b>${escapeHtml(meta.customerAgencyGroupLabel)}</b> / ${escapeHtml(meta.customerAgencyTypeLabel)}${prefixText}`;
}
function applyCustomerAgencyToForm(prefix,recordOrName={}){
  const name=typeof recordOrName==='string'?recordOrName:(recordOrName.customer||recordOrName.customerName||getCustomerNameForForm(prefix)||'');
  const inferred=inferCustomerAgency(name);
  const group=recordOrName.customerAgencyGroup||inferred.customerAgencyGroup;
  const type=recordOrName.customerAgencyType||inferred.customerAgencyType;
  populateCustomerAgencyGroupOptions(prefix);
  const groupEl=document.getElementById(prefix+'-agency-group');if(groupEl)groupEl.value=group;
  populateCustomerAgencyTypeOptions(prefix);
  const typeEl=document.getElementById(prefix+'-agency-type');if(typeEl)typeEl.value=type;
  renderCustomerAgencyHint(prefix);
}
function autoDetectCustomerAgency(prefix){
  const inferred=inferCustomerAgency(getCustomerNameForForm(prefix));
  applyCustomerAgencyToForm(prefix,inferred);
}
function getCustomerAgencyFromForm(prefix){
  const name=getCustomerNameForForm(prefix);
  const inferred=inferCustomerAgency(name);
  const group=document.getElementById(prefix+'-agency-group')?.value||inferred.customerAgencyGroup;
  const type=document.getElementById(prefix+'-agency-type')?.value||inferred.customerAgencyType;
  const typeMeta=agencyTypeMeta(type);
  const finalGroup=typeMeta?.group||group||'other';
  return{
    customerAgencyGroup:finalGroup,
    customerAgencyGroupLabel:agencyGroupLabel(finalGroup),
    customerAgencyType:typeMeta?.value||'other',
    customerAgencyTypeLabel:typeMeta?.label||'อื่น ๆ / ไม่ระบุ',
    customerPrefix:typeMeta?.prefix||'',
    customerAgencyDetectedFrom:(group===inferred.customerAgencyGroup&&type===inferred.customerAgencyType)?inferred.customerAgencyDetectedFrom:'manual',
    customerAgencyConfidence:(typeMeta?.value&&typeMeta.value!=='other')?'classified':inferred.customerAgencyConfidence
  };
}
function customerAgencyForRecord(record={}){
  const inferred=inferCustomerAgency(record.customer||record.customerName||record.client||'');
  const group=record.customerAgencyGroup||record.agencyGroup||inferred.customerAgencyGroup;
  const type=record.customerAgencyType||record.agencyType||inferred.customerAgencyType;
  const typeMeta=agencyTypeMeta(type);
  const finalGroup=typeMeta?.group||group||'other';
  return{
    customerAgencyGroup:finalGroup,
    customerAgencyGroupLabel:record.customerAgencyGroupLabel||agencyGroupLabel(finalGroup),
    customerAgencyType:typeMeta?.value||'other',
    customerAgencyTypeLabel:record.customerAgencyTypeLabel||typeMeta?.label||'อื่น ๆ / ไม่ระบุ',
    customerPrefix:record.customerPrefix||typeMeta?.prefix||'',
    customerAgencyDetectedFrom:record.customerAgencyDetectedFrom||inferred.customerAgencyDetectedFrom,
    customerAgencyConfidence:record.customerAgencyConfidence||inferred.customerAgencyConfidence
  };
}
function withCustomerAgencyMeta(record={}){return{...record,...customerAgencyForRecord(record)};}
function initCustomerAgencyControls(){
  ['q','i','r','p'].forEach(prefix=>{
    populateCustomerAgencyGroupOptions(prefix);
    populateCustomerAgencyTypeOptions(prefix);
    renderCustomerAgencyHint(prefix);
  });
  populateAnalyticsAgencyFilters();
}
function populateAnalyticsAgencyFilters(){
  const groupEl=document.getElementById('analytics-agency-group');
  if(groupEl){
    const cur=groupEl.value;
    groupEl.innerHTML='<option value="">ทุกประเภทหน่วยงาน</option>'+CUSTOMER_AGENCY_GROUPS.map(g=>`<option value="${g.value}">${escapeHtml(g.label)}</option>`).join('');
    groupEl.value=cur||'';
  }
  populateAnalyticsAgencyTypeOptions(false);
}
function populateAnalyticsAgencyTypeOptions(shouldRender=true){
  const group=document.getElementById('analytics-agency-group')?.value||'';
  const typeEl=document.getElementById('analytics-agency-type');if(!typeEl)return;
  const cur=typeEl.value;
  const list=CUSTOMER_AGENCY_TYPES.filter(t=>!group||t.group===group);
  typeEl.innerHTML='<option value="">ทุกประเภทย่อย</option>'+list.map(t=>`<option value="${t.value}">${escapeHtml(t.label)}</option>`).join('');
  typeEl.value=list.some(t=>t.value===cur)?cur:'';
  if(shouldRender)renderDataAnalytics();
}
const now=new Date();
const todayStr=now.toISOString().split('T')[0];


// ============================================================
// THAI BUDDHIST CALENDAR HELPERS
// ใช้ พ.ศ. สำหรับการแสดงผล/รายงาน แต่เก็บ year ภายในเป็น ค.ศ. เพื่อให้ Date, Query และ Storage ทำงานถูกต้อง
// ============================================================
function toCEYear(year){
  const y=Number(year);
  if(!Number.isFinite(y))return now.getFullYear();
  return y>=2400?y-543:y;
}
function toBEYear(year){
  const y=Number(year);
  if(!Number.isFinite(y))return '';
  return y>=2400?y:y+543;
}
function yearLabelBE(year){return String(toBEYear(year));}
function yearLabelDual(year){
  return String(toBEYear(year));
}
function parseFlexibleBusinessDate(value){
  if(!value)return null;
  if(value?.toDate){
    const d=value.toDate();
    return d&&!Number.isNaN(d.getTime())?d:null;
  }
  if(value?.seconds){
    const d=new Date(Number(value.seconds)*1000);
    return !Number.isNaN(d.getTime())?d:null;
  }
  const raw=String(value||'').trim();
  let m=raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if(m){
    const y=toCEYear(Number(m[1]));
    const d=new Date(y,Number(m[2])-1,Number(m[3]));
    return Number.isNaN(d.getTime())?null:d;
  }
  // รองรับวันที่ไทย/Excel แบบ DD/MM/YYYY หรือ DD-MM-YYYY ทั้ง ค.ศ. และ พ.ศ.
  m=raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s*\(ค\.ศ\.\s*(\d{4})\))?$/);
  if(m){
    const y=toCEYear(Number(m[3]));
    const d=new Date(y,Number(m[2])-1,Number(m[1]));
    return Number.isNaN(d.getTime())?null:d;
  }
  const d=new Date(raw);
  return Number.isNaN(d.getTime())?null:d;
}
function isoDateCEFromValue(value){
  const raw=String(value||'').trim();
  const d=parseFlexibleBusinessDate(raw);
  if(!d)return raw;
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function formatThaiDate(value){
  const d=parseFlexibleBusinessDate(value);
  if(!d)return value?String(value):'-';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${toBEYear(d.getFullYear())}`;
}
function makeThaiCalendarMeta(dateValue, fallbackYear=now.getFullYear(), fallbackMonth=now.getMonth()){
  const d=parseFlexibleBusinessDate(dateValue);
  const year=d?d.getFullYear():toCEYear(fallbackYear);
  const month=d?d.getMonth():Number(fallbackMonth||0);
  return{
    date:d?isoDateCEFromValue(dateValue):String(dateValue||''),
    year,
    yearCE:year,
    yearBE:toBEYear(year),
    buddhistYear:toBEYear(year),
    month,
    monthIndex:month,
    monthNumber:month+1,
    dateThai:d?formatThaiDate(dateValue):'',
    displayDate:d?formatThaiDate(dateValue):String(dateValue||'')
  };
}
function withThaiCalendarMeta(record={},year,month){
  const meta=makeThaiCalendarMeta(record.date,year,month);
  return{...record,...meta};
}
let dashTab='all'; // 'all' | 'khonkaen' | 'ubon'
const formBranch={q:null,i:null,r:null,e:null,p:null};
const attachedFiles={};

// EDIT MODE — ใช้แก้ไขเอกสารเดิมโดยไม่สร้างรายการซ้ำ
const editState={quote:null,invoice:null,receipt:null,production:null};

function clearEditState(type){
  editState[type]=null;
  const prefix={quote:'q',invoice:'i',receipt:'r',production:'p'}[type];
  const banner=document.getElementById(prefix+'-edit-banner');
  const saveBtn=document.getElementById(prefix+'-save-btn');
  if(banner)banner.style.display='none';
  if(saveBtn)saveBtn.textContent=type==='quote'?'💾 บันทึกใบเสนอราคา':type==='invoice'?'💾 บันทึกใบส่งสินค้า / ใบกำกับภาษี':type==='receipt'?'💾 บันทึกใบเสร็จรับเงิน':'💾 บันทึกสั่งผลิตสินค้า';
}
function beginEditState(type,meta){
  editState[type]=meta;
  const prefix={quote:'q',invoice:'i',receipt:'r',production:'p'}[type];
  const banner=document.getElementById(prefix+'-edit-banner');
  const saveBtn=document.getElementById(prefix+'-save-btn');
  if(banner){banner.style.display='flex';banner.querySelector('[data-edit-label]').textContent=`กำลังแก้ไข: ${meta.no||meta.id}`;}
  if(saveBtn)saveBtn.textContent='💾 บันทึกการแก้ไข';
}
function navToPanel(panelId){
  const nav=[...document.querySelectorAll('.nav-item')].find(el=>String(el.getAttribute('onclick')||'').includes(`'${panelId}'`));
  window.go?.(panelId,nav||null);
}
function findLocalRecord(type,branch,year,month,id){
  const data=loadFor(branch,Number(year),Number(month));
  const list=data[type]||[];
  const index=list.findIndex(x=>String(x.id)===String(id));
  return{data,list,index,record:index>=0?list[index]:null};
}
function setInputValue(id,value){const el=document.getElementById(id);if(el)el.value=value??'';}
function loadExistingAttachments(key,files){
  clearAttachedFiles(key);
  attachedFiles[key]=(Array.isArray(files)?files:[]).map(file=>({...file}));
  renderPrev(key);
}
function cancelDocumentEdit(type){
  clearEditState(type);
  if(type==='production')resetProduction();
  else resetF(type);
}

// ============================================================
// STORAGE — key includes YEAR so data is preserved across years
// ============================================================
function keyFor(branch,year,month){
  return tenantLocalKey(`biz2_${branch}_${year}_${String(month+1).padStart(2,'0')}`);
}
function createEmptyBusinessStore(){
  return {quotes:[],invoices:[],receipts:[],issuedInvoices:[],issuedReceipts:[],expenses:[],productions:[]};
}
function loadFor(branch,year,month){
  const empty=createEmptyBusinessStore();
  try{
    const raw=localStorage.getItem(keyFor(branch,year,month));
    if(!raw)return empty;
    const parsed=JSON.parse(raw);
    if(!parsed || typeof parsed!=="object" || Array.isArray(parsed))throw new TypeError("invalid-storage-shape");
    return{
      ...empty,
      ...parsed,
      quotes:Array.isArray(parsed.quotes)?parsed.quotes:[],
      invoices:Array.isArray(parsed.invoices)?parsed.invoices:[],
      receipts:Array.isArray(parsed.receipts)?parsed.receipts:[],
      issuedInvoices:Array.isArray(parsed.issuedInvoices)?parsed.issuedInvoices:[],
      issuedReceipts:Array.isArray(parsed.issuedReceipts)?parsed.issuedReceipts:[],
      expenses:Array.isArray(parsed.expenses)?parsed.expenses:[],
      productions:Array.isArray(parsed.productions)?parsed.productions:[]
    };
  }catch(err){
    console.error(`อ่านข้อมูล localStorage ไม่สำเร็จ (${branch}/${year}/${month}):`,err);
    return empty;
  }
}
function localCacheJsonReplacer(key,value){
  // Never put image/PDF bytes or temporary object URLs in localStorage.
  // Files are uploaded to Google Drive, or stored in IndexedDB as local-only fallback.
  if(['data','file','blob','previewUrl','objectUrl'].includes(key))return undefined;
  if(typeof Blob!=='undefined' && value instanceof Blob)return undefined;
  return value;
}
function saveFor(branch,year,month,data){
  try{
    localStorage.setItem(keyFor(branch,year,month),JSON.stringify(data,localCacheJsonReplacer));
  }catch(err){
    console.error('บันทึกข้อมูลลง localStorage ไม่สำเร็จ:',err);
    const isQuota=err?.name==='QuotaExceededError'||err?.code===22||err?.code===1014;
    notify(isQuota
      ?'พื้นที่จัดเก็บของเบราว์เซอร์เต็ม กรุณาลบข้อมูลเก่าหรือรีเฟรชแล้วลองใหม่\nระบบจะไม่เก็บไฟล์ภาพ/PDF เป็น Base64 ใน localStorage อีกต่อไป'
      :'บันทึกข้อมูลในเครื่องไม่สำเร็จ: '+(err?.message||err));
    throw err;
  }
}

// Collect all years that have data
function allYears(){
  const ys=new Set();
  ys.add(now.getFullYear());
  for(let k in localStorage){
    const rawKey=window.ComformTenant?.unwrapStorageKey?.(k)||'';
    if(!rawKey.startsWith('biz2_'))continue;
    const parts=rawKey.split('_');
    // key format: biz2_{branch}_{year}_{month}
    // parts[2] is the document year. parts[3] is month, so do NOT use it as a year.
    const y=parseInt(parts[2],10);
    if(Number.isFinite(y) && y>=2020 && y<=2100) ys.add(y);
  }
  return [...ys].sort((a,b)=>b-a);
}

// Get all docs across all months of a year for both branches (or one)
function docsForYear(type,year,branch){
  const branches=branch?[branch]:tenantActiveBranchIds();
  const result=[];
  branches.forEach(br=>{
    for(let m=0;m<12;m++){
      const d=loadFor(br,year,m);
      (d[type]||[]).forEach(x=>result.push({...x,branch:br,_month:m,_year:year}));
    }
  });
  return result;
}

// Get docs for a specific branch+year+month (or all months)
function docsFor(type,branch,year,month){
  const branches=branch?[branch]:tenantActiveBranchIds();
  const result=[];
  const months=(month===''||month===undefined||month===null)?Array.from({length:12},(_,i)=>i):[parseInt(month)];
  branches.forEach(br=>{
    months.forEach(m=>{
      const d=loadFor(br,year,m);
      (d[type]||[]).forEach(x=>result.push({...x,branch:br,_month:m,_year:year}));
    });
  });
  return result;
}

// ============================================================
// FIREBASE CLOUD SYNC — Firestore is the shared source, localStorage is only local cache
// ============================================================
const FIREBASE_COLLECTION_TO_LOCAL = {
  quotes: 'quotes',
  invoices: 'invoices',
  receipts: 'receipts',
  issuedInvoices: 'issuedInvoices',
  issuedReceipts: 'issuedReceipts',
  expenses: 'expenses',
  productions: 'productions'
};

let cloudSyncRunning = false;
let cloudSyncTimer = null;

// ============================================================
// PRODUCTION SAFETY GUARDS
// ============================================================
const CLOUD_SYNC_SAFETY = Object.freeze({
  enabled: true,
  backupBeforeReplace: true,
  maxBackups: 8,
  minimumLocalRowsForDropGuard: 3,
  // ถ้า Cloud เหลือน้อยกว่า 25% ของ Local เดิม ให้ถือว่าน่าสงสัยและไม่ล้าง Local อัตโนมัติ
  minimumCloudRatioBeforeReplace: 0.25
});
const LOCAL_BACKUP_INDEX_KEY = 'comform_auto_backup_index_v1';
const LOCAL_BACKUP_KEY_PREFIX = 'comform_auto_backup_v1_';

function localBackupNowId(){
  return new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)+'_'+Math.random().toString(36).slice(2,8);
}
function readLocalBackupIndex(){
  try{
    const rows=JSON.parse(localStorage.getItem(tenantLocalKey(LOCAL_BACKUP_INDEX_KEY))||'[]');
    return Array.isArray(rows)?rows:[];
  }catch(_){return [];}
}
function writeLocalBackupIndex(rows){
  localStorage.setItem(tenantLocalKey(LOCAL_BACKUP_INDEX_KEY),JSON.stringify(rows));
}
function listLocalBackups(){
  return readLocalBackupIndex();
}
function createLocalBackupSnapshot(year=getCurrentSelectedYear(), reason='manual', profile=getCurrentProfile()){
  if(typeof localStorage==='undefined')return null;
  const y=Number(year)||now.getFullYear();
  const branches=getCloudSyncBranches(profile);
  const id=localBackupNowId();
  const key=tenantLocalKey(LOCAL_BACKUP_KEY_PREFIX+id);
  const snapshot={
    id,
    version:1,
    createdAt:new Date().toISOString(),
    year:y,
    reason,
    branchScope:branches,
    user:getCurrentProfile()?.email||'',
    data:{}
  };
  branches.forEach(branch=>{
    snapshot.data[branch]={};
    for(let month=0;month<12;month++){
      const storageKey=keyFor(branch,y,month);
      snapshot.data[branch][month]=localStorage.getItem(storageKey)||null;
    }
  });
  try{
    localStorage.setItem(key,JSON.stringify(snapshot));
    const index=[{id,key,year:y,reason,createdAt:snapshot.createdAt,branches},...readLocalBackupIndex().filter(x=>x?.id!==id)];
    const keep=index.slice(0,CLOUD_SYNC_SAFETY.maxBackups);
    index.slice(CLOUD_SYNC_SAFETY.maxBackups).forEach(item=>{try{localStorage.removeItem(item.key||tenantLocalKey(LOCAL_BACKUP_KEY_PREFIX+item.id));}catch(_){}});
    writeLocalBackupIndex(keep);
    return snapshot;
  }catch(error){
    console.warn('สร้าง Auto Backup ก่อน Sync ไม่สำเร็จ:',error);
    return null;
  }
}
function restoreLocalBackupSnapshot(id){
  const entry=readLocalBackupIndex().find(x=>String(x.id)===String(id));
  if(!entry)throw new Error('ไม่พบ Backup: '+id);
  const snapshot=JSON.parse(localStorage.getItem(entry.key||tenantLocalKey(LOCAL_BACKUP_KEY_PREFIX+entry.id))||'null');
  if(!snapshot?.data)throw new Error('ไฟล์ Backup เสียหรืออ่านไม่ได้');
  Object.entries(snapshot.data).forEach(([branch,months])=>{
    Object.entries(months||{}).forEach(([month,raw])=>{
      const storageKey=keyFor(branch,Number(snapshot.year),Number(month));
      if(raw===null)localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey,raw);
    });
  });
  dedupeLocalYear(Number(snapshot.year));
  rerenderAfterCloudWrite(Number(snapshot.year));
  return snapshot;
}
function countLocalRowsByType(year,branches=getCloudSyncBranches(getCurrentProfile())){
  const counts=Object.fromEntries(Object.values(FIREBASE_COLLECTION_TO_LOCAL).map(type=>[type,0]));
  branches.forEach(branch=>{
    for(let month=0;month<12;month++){
      const data=loadFor(branch,Number(year),month);
      Object.keys(counts).forEach(type=>{counts[type]+=Array.isArray(data[type])?data[type].length:0;});
    }
  });
  return counts;
}
function inferCloudDocYear(doc={}){
  const direct=Number(doc.year ?? doc._y ?? doc.yearCE ?? doc.docYear ?? doc.recordYear);
  if(Number.isFinite(direct)&&direct>=2020&&direct<=2100)return direct;
  if(Number.isFinite(direct)&&direct>=2500&&direct<=2700)return direct-543;
  const date=parseFlexibleBusinessDate(doc.date);
  if(date)return date.getFullYear();
  const be=Number(doc.yearBE ?? doc.buddhistYear);
  if(Number.isFinite(be)&&be>=2500&&be<=2700)return be-543;
  return now.getFullYear();
}
function inferLocalTypeFromCloudDoc(collectionName,doc={}){
  if(collectionName==='invoices' && doc?.documentKind==='delivery-tax-invoice')return 'issuedInvoices';
  if(collectionName==='receipts' && doc?.documentKind==='receipt-document')return 'issuedReceipts';
  return FIREBASE_COLLECTION_TO_LOCAL[collectionName];
}
function countCloudRowsByTypeForYear(pack,year,branches=getCloudSyncBranches(getCurrentProfile())){
  const branchSet=new Set(branches);
  const counts=Object.fromEntries(Object.values(FIREBASE_COLLECTION_TO_LOCAL).map(type=>[type,0]));
  const loadedCollections=Array.isArray(pack?._loadedCollections)?pack._loadedCollections:Object.keys(FIREBASE_COLLECTION_TO_LOCAL);
  loadedCollections.forEach(collectionName=>{
    (pack?.[collectionName]||[]).forEach(doc=>{
      const type=inferLocalTypeFromCloudDoc(collectionName,doc);
      if(!type || !(type in counts))return;
      if(doc.branch && BRANCH_TH[doc.branch] && !branchSet.has(doc.branch))return;
      if(inferCloudDocYear(doc)!==Number(year))return;
      counts[type]+=1;
    });
  });
  return counts;
}
function buildCloudReplacePlan(year,pack,profile,options={}){
  const loadedCollections=Array.isArray(pack?._loadedCollections)
    ? new Set(pack._loadedCollections)
    : new Set(Object.keys(FIREBASE_COLLECTION_TO_LOCAL));
  const branches=getCloudSyncBranches(profile);
  const localCounts=countLocalRowsByType(Number(year),branches);
  const cloudCounts=countCloudRowsByTypeForYear(pack,Number(year),branches);
  const touchedTypes=new Set();
  loadedCollections.forEach(collectionName=>{
    const baseType=FIREBASE_COLLECTION_TO_LOCAL[collectionName];
    if(baseType)touchedTypes.add(baseType);
    (pack?.[collectionName]||[]).forEach(doc=>{
      const type=inferLocalTypeFromCloudDoc(collectionName,doc);
      if(type)touchedTypes.add(type);
    });
  });
  const allowedTypes=new Set();
  const skippedTypes=[];
  touchedTypes.forEach(type=>{
    const localCount=localCounts[type]||0;
    const cloudCount=cloudCounts[type]||0;
    if(options.force || !CLOUD_SYNC_SAFETY.enabled){allowedTypes.add(type);return;}
    if(localCount>0 && cloudCount===0){
      skippedTypes.push({type,localCount,cloudCount,reason:'cloud-empty'});
      return;
    }
    if(localCount>=CLOUD_SYNC_SAFETY.minimumLocalRowsForDropGuard && cloudCount>0 && cloudCount/localCount<CLOUD_SYNC_SAFETY.minimumCloudRatioBeforeReplace){
      skippedTypes.push({type,localCount,cloudCount,reason:'sudden-drop'});
      return;
    }
    allowedTypes.add(type);
  });
  return{loadedCollections,allowedTypes,skippedTypes,localCounts,cloudCounts};
}

function getCurrentProfile(){
  return window.ComformAuth?.getCurrentProfile?.() || window.CurrentUser || null;
}

function getCurrentSelectedYear(){
  const ids = ['dash-year','ql-year','il-year','rl-year','oil-year','orl-year','el-year','pl-year'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el?.value) return Number(el.value);
  }
  return now.getFullYear();
}

function monthFromDateString(dateStr){
  const d=parseFlexibleBusinessDate(dateStr);
  return d?d.getMonth():null;
}

function normalizeCloudMonth(doc){
  // The business date is the most reliable source. Older builds accidentally shifted
  // Firestore monthIndex back by one month, so prefer date to repair those rows locally.
  const fromDate = monthFromDateString(doc.date);
  if (fromDate !== null) return fromDate;

  const monthIndex = Number(doc.monthIndex);
  if (Number.isFinite(monthIndex) && monthIndex >= 0 && monthIndex <= 11) return monthIndex;

  const monthNumber = Number(doc.monthNumber);
  if (Number.isFinite(monthNumber) && monthNumber >= 1 && monthNumber <= 12) return monthNumber - 1;

  const rawMonth = Number(doc.month ?? 0);
  // In this app, record.month is JavaScript month index 0-11.
  if (Number.isFinite(rawMonth) && rawMonth >= 0 && rawMonth <= 11) return rawMonth;
  if (Number.isFinite(rawMonth) && rawMonth >= 1 && rawMonth <= 12) return rawMonth - 1;

  return 0;
}

function sameBusinessDoc(a, b){
  if (!a || !b) return false;

  if (a.firebaseId && b.firebaseId && String(a.firebaseId) === String(b.firebaseId)) return true;
  if (a.id !== undefined && b.id !== undefined && String(a.id) === String(b.id)) return true;

  const aNo = a.no || a.invNo || '';
  const bNo = b.no || b.invNo || '';
  if (aNo && bNo && a.date && b.date && String(aNo) === String(bNo) && String(a.date) === String(b.date)) {
    const aBranch = a.branch || '';
    const bBranch = b.branch || '';
    return !aBranch || !bBranch || aBranch === bBranch;
  }

  return false;
}

function mergeBusinessDoc(oldDoc, newDoc){
  // ใช้รวมรายการ localStorage กับรายการเดียวกันที่ sync กลับมาจาก Firebase
  // เครื่องที่กรอกข้อมูลจะมี local row ก่อน แล้ว cloud row ตามมา จึงต้องรวมให้เหลือแถวเดียว
  const merged = { ...oldDoc, ...newDoc };
  merged.firebaseId = newDoc.firebaseId || oldDoc.firebaseId || merged.firebaseId;
  merged.branch = newDoc.branch || oldDoc.branch || merged.branch;
  merged._m = Number.isFinite(Number(newDoc._m)) ? Number(newDoc._m) : oldDoc._m;
  merged._y = Number.isFinite(Number(newDoc._y)) ? Number(newDoc._y) : oldDoc._y;
  return merged;
}

function dedupeRecords(rows){
  const result = [];
  (rows || []).forEach(row => {
    const idx = result.findIndex(existing => sameBusinessDoc(existing, row));
    if (idx >= 0) result[idx] = mergeBusinessDoc(result[idx], row);
    else result.push(row);
  });
  return result;
}

function dedupeForListDisplay(rows){
  // กันแถวซ้ำเฉพาะเครื่องที่เป็นคนบันทึก: local row + cloud row
  // ไม่ลบข้อมูล Firebase และไม่กระทบเครื่องอื่น แค่รวมรายการเดียวกันก่อนแสดงผล
  return dedupeRecords(rows || []);
}

function rerenderAfterCloudWrite(year){
  try { dedupeLocalYear(Number(year)); } catch (err) { console.warn('dedupe after cloud write failed:', err); }
  try { onYearChange(false); } catch (_) {}
  renderDash();
  renderQLList();
  renderIList();
  renderRList();
  renderIssuedInvoiceList();
  renderIssuedReceiptList();
  renderEList();
  renderPList();
  renderDataAnalytics();
  populateInvRefs();
  populateProductionRefs();
}

function targetMonthForLocalRecord(record, fallbackMonth = 0){
  const fromDate = monthFromDateString(record?.date);
  if (fromDate !== null) return fromDate;

  const fromCloud = normalizeCloudMonth(record || {});
  if (Number.isFinite(fromCloud) && fromCloud >= 0 && fromCloud <= 11) return fromCloud;

  return Number(fallbackMonth) || 0;
}

function dedupeLocalYear(year = getCurrentSelectedYear()){
  const types = ['quotes', 'invoices', 'receipts', 'issuedInvoices', 'issuedReceipts', 'expenses', 'productions'];

  ['khonkaen', 'ubon'].forEach(branch => {
    const collected = Object.fromEntries(types.map(type => [type, []]));

    for (let m = 0; m < 12; m++) {
      const d = loadFor(branch, year, m);
      types.forEach(type => {
        (d[type] || []).forEach(row => collected[type].push({ ...row, branch: row.branch || branch, _sourceMonth: m }));
      });
    }

    const months = Array.from({ length: 12 }, () => ({
      quotes: [], invoices: [], receipts: [], issuedInvoices: [], issuedReceipts: [], expenses: [], productions: []
    }));

    types.forEach(type => {
      dedupeRecords(collected[type]).forEach(row => {
        const targetMonth = targetMonthForLocalRecord(row, row._sourceMonth);
        const clean = { ...row };
        delete clean._sourceMonth;
        months[targetMonth][type].push(clean);
      });
    });

    for (let m = 0; m < 12; m++) saveFor(branch, year, m, months[m]);
  });
}

function mergeCloudDoc(collectionName, doc){
  // เอกสารที่ออกจริงจากเวอร์ชันเก่าเคยถูกเก็บรวมใน invoices/receipts
  // ให้แยกเข้าชุดข้อมูลเอกสารที่ออกจริงตั้งแต่ตอน Sync เพื่อไม่ให้ยอดถูกนับซ้ำ
  let type = FIREBASE_COLLECTION_TO_LOCAL[collectionName];
  if(collectionName==='invoices' && doc?.documentKind==='delivery-tax-invoice') type='issuedInvoices';
  if(collectionName==='receipts' && doc?.documentKind==='receipt-document') type='issuedReceipts';
  if (!type) return;

  const branch = doc.branch;
  if (!BRANCH_TH[branch]) return;

  const year = inferCloudDocYear(doc);
  const month = normalizeCloudMonth(doc);
  const d = loadFor(branch, year, month);
  if (!Array.isArray(d[type])) d[type] = [];

  const incoming = withThaiCalendarMeta({ ...doc, branch, _m: month, _y: year, storageCollection: collectionName }, year, month);
  const idx = d[type].findIndex(x =>
    (incoming.firebaseId && x.firebaseId === incoming.firebaseId) ||
    (incoming.id !== undefined && x.id !== undefined && String(x.id) === String(incoming.id)) ||
    (incoming.no && x.no === incoming.no && x.date === incoming.date && x.branch === incoming.branch)
  );

  if (idx >= 0) d[type][idx] = mergeBusinessDoc(d[type][idx], incoming);
  else d[type].push(incoming);

  saveFor(branch, year, month, d);
}

function getCloudSyncBranches(profile){
  if(profile?.branch && profile.branch !== 'all' && BRANCH_TH[profile.branch]) return [profile.branch];
  return tenantActiveBranchIds();
}

function replaceLocalYearWithCloudPack(year, pack, profile, options = {}){
  const y=Number(year);
  if(CLOUD_SYNC_SAFETY.backupBeforeReplace && !options.skipBackup){
    createLocalBackupSnapshot(y,'before-firebase-sync',profile);
  }

  const plan=buildCloudReplacePlan(y,pack,profile,options);
  const loadedCollections=plan.loadedCollections;

  // ล้างเฉพาะประเภทที่อ่านจาก Firebase สำเร็จและผ่าน Safety Guard เท่านั้น
  // ถ้า Cloud ว่างผิดปกติหรือจำนวนลดฮวบ จะไม่ล้าง Local cache เพื่อป้องกันข้อมูลหาย
  getCloudSyncBranches(profile).forEach(br=>{
    for(let m=0;m<12;m++){
      const d=loadFor(br,y,m);
      plan.allowedTypes.forEach(type=>{ d[type]=[]; });
      saveFor(br,y,m,d);
    }
  });

  [...loadedCollections].forEach(collectionName=>{
    (pack?.[collectionName]||[]).forEach(doc=>mergeCloudDoc(collectionName,doc));
  });

  if(plan.skippedTypes.length){
    console.warn('ยกเลิกการล้าง Local cache บางประเภทเพราะ Cloud มีข้อมูลน่าสงสัย:', plan.skippedTypes);
    try{
      window.dispatchEvent(new CustomEvent('comform-sync-safety-warning',{detail:{year:y,skippedTypes:plan.skippedTypes}}));
    }catch(_){}
  }

  if(pack?._errors && Object.keys(pack._errors).length){
    console.warn('บาง Collection โหลดไม่สำเร็จ จึงเก็บ Local cache เดิมไว้:', pack._errors);
  }
}


async function syncFromFirebaseYear(year = getCurrentSelectedYear(), options = {}){
  const profile = getCurrentProfile();

  if (!profile) {
    if (!options.silent) console.warn('ยังไม่ได้ Login จึงยังไม่ดึงข้อมูลจาก Firebase');
    return false;
  }

  if (!window.FirebaseService?.loadAllDashboardDataByYear) {
    if (!options.silent) console.warn('ยังไม่พบ FirebaseService');
    return false;
  }

  if (cloudSyncRunning) return false;
  cloudSyncRunning = true;

  try {
    const pack = await window.FirebaseService.loadAllDashboardDataByYear(Number(year));
    // Firestore เป็นแหล่งข้อมูลหลัก: โหลดสำเร็จแล้วให้แทนที่ cache ในเครื่องของปี/สาขานี้
    // เพื่อให้เอกสารที่ถูกลบบน Firebase หายจากเครื่องพนักงานด้วย
    replaceLocalYearWithCloudPack(Number(year), pack, profile, options);

    // Clean duplicated local/cloud rows and move old wrongly shifted cloud rows
    // back to the month shown by their document date.
    dedupeLocalYear(Number(year));

    onYearChange(false);
    renderDash();
    renderQLList();
    renderIList();
    renderRList();
    renderIssuedInvoiceList();
    renderIssuedReceiptList();
    renderEList();
    renderPList();
    populateInvRefs();
    populateProductionRefs();
    refreshAutoDocumentNumber('quote');
    refreshAutoDocumentNumber('invoice');
    refreshAutoDocumentNumber('receipt');
    return true;
  } catch (err) {
    console.error('ดึงข้อมูลจาก Firebase ไม่สำเร็จ:', err);
    if (!options.silent) {
      notify('ดึงข้อมูลจาก Firebase ไม่สำเร็จ กรุณาตรวจ Firestore Rules และอินเทอร์เน็ต');
    }
    return false;
  } finally {
    cloudSyncRunning = false;
  }
}

function scheduleCloudSync(year = getCurrentSelectedYear()) {
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => syncFromFirebaseYear(year, { silent: true }), 250);
}

async function persistAttachmentsLocalFallback(saveFnName,record,branch,year,month){
  const typeMap={saveQuote:'quotes',saveInvoice:'invoices',saveReceipt:'receipts',saveExpense:'expenses',saveProduction:'productions'};
  const type=typeMap[saveFnName];
  if(!type||!Array.isArray(record.attachments)||!record.attachments.length||!window.LocalFileStore?.saveLocalAttachment)return;
  const saved=[];
  for(const file of record.attachments){
    saved.push(await window.LocalFileStore.saveLocalAttachment(file,{...record,branch},type));
  }
  const d=loadFor(branch,year,month);
  const item=(d[type]||[]).find(x=>String(x.id)===String(record.id));
  if(item){item.attachments=saved;item.storageProvider='local-only';saveFor(branch,year,month,d);}
}

function saveCloudRecord(saveFnName, record, branch, year, month, typeName){
  const service = window.FirebaseService;
  const enriched = withThaiCalendarMeta({ ...record, branch }, year, month);
  if (!service?.[saveFnName]) {
    console.warn('ยังไม่พบ FirebaseService — จะเก็บหลักฐานไว้ใน IndexedDB ของเครื่องนี้');
    persistAttachmentsLocalFallback(saveFnName,enriched,branch,year,month)
      .then(()=>rerenderAfterCloudWrite(year))
      .catch(err=>notify('บันทึกข้อมูลได้ แต่เก็บไฟล์หลักฐานในเครื่องไม่สำเร็จ: '+(err?.message||err)));
    return;
  }

  service[saveFnName]({ ...enriched, branch, year, month })
    .then(ref => {
      if (ref?.id) {
        record.firebaseId = ref.id;
        const typeMap = { saveQuote:'quotes', saveInvoice:'invoices', saveReceipt:'receipts', saveExpense:'expenses', saveProduction:'productions' };
        const type = typeMap[saveFnName];
        if (type) {
          const d = loadFor(branch, year, month);
          const item = (d[type] || []).find(x => String(x.id) === String(record.id));
          if (item) {
            Object.assign(item, withThaiCalendarMeta(item, year, month));
            item.firebaseId = ref.id;
            if(Array.isArray(ref.attachments))item.attachments=ref.attachments;
            if(ref.storageProvider)item.storageProvider=ref.storageProvider;
            saveFor(branch, year, month, d);
          }
        }
      }
      // เครื่องที่กรอกข้อมูลจะมีข้อมูล local อยู่แล้ว ไม่ต้องรอ sync รอบถัดไปจึงค่อยล้างแถวซ้ำ
      rerenderAfterCloudWrite(year);
      scheduleCloudSync(year);
    })
    .catch(err => {
      console.error(`Firebase ${saveFnName} error:`, err);
      const msg = err?.code || err?.message || String(err);
      notify(`บันทึก${typeName}ไว้ในเครื่องนี้แล้ว แต่ยังไม่ขึ้น Firebase/เครื่องอื่น\nสาเหตุจาก Firebase: ${msg}\nกรุณาตรวจ Firestore Rules, users/{uid}.branch และสาขาของเอกสาร`);
    });
}

// ============================================================
// INIT — populate year/month dropdowns
// ============================================================
function initDropdowns(){
  const years=allYears();
  // Dashboard
  populateYearSel('dash-year',years);
  populateMonthSel('dash-month',true);
  populateYearSel('analytics-year',years);
  populateMonthSel('analytics-month',false);
  // Lists
  ['ql','il','rl','oil','orl','el','pl'].forEach(p=>{
    populateYearSel(p+'-year',years);
    populateMonthSel(p+'-month',false);
  });
  // Default current year/month
  ['dash-year','analytics-year','ql-year','il-year','rl-year','oil-year','orl-year','el-year','pl-year'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value=now.getFullYear();
  });
  ['analytics-month','ql-month','il-month','rl-month','oil-month','orl-month','el-month','pl-month'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  ['p-quote-filter-month','i-prod-filter-month','r-inv-filter-month'].forEach(id=>populateMonthSel(id,false));
  ['i-prod-filter-year','r-inv-filter-year'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.value)el.value=now.getFullYear();});
  document.getElementById('dash-month').value=-1;
}

function populateYearSel(id,years){
  const el=document.getElementById(id);if(!el)return;
  el.innerHTML='';
  years.forEach(y=>{const ce=toCEYear(y);const o=document.createElement('option');o.value=ce;o.textContent='พ.ศ. '+yearLabelDual(ce);o.title='พ.ศ. '+yearLabelDual(ce);el.appendChild(o);});
}

function populateMonthSel(id,hasAll){
  const el=document.getElementById(id);if(!el)return;
  const cur=el.value;
  el.innerHTML='';
  if(hasAll){const o=document.createElement('option');o.value=-1;o.textContent='ทุกเดือน';el.appendChild(o);}
  else{const o=document.createElement('option');o.value='';o.textContent='ทุกเดือน';el.appendChild(o);}
  MONTHS.forEach((m,i)=>{const o=document.createElement('option');o.value=i;o.textContent=m;el.appendChild(o);});
  el.value=cur;
}

function onYearChange(shouldSync = true){
  // Refresh year dropdowns with any newly found years
  const years=allYears();
  ['dash-year','ql-year','il-year','rl-year','oil-year','orl-year','el-year','pl-year'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    const cur=el.value;
    populateYearSel(id,years);
    el.value=cur;
  });
  if (shouldSync) scheduleCloudSync(getCurrentSelectedYear());
}

// ============================================================
// NAVIGATION
// ============================================================
function go(id,el){
  const panel = document.getElementById('panel-'+id);
  if (!panel) {
    console.warn('ไม่พบ panel:', id);
    return;
  }
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  panel.classList.add('active');
  if (el && el.classList) {
    el.classList.add('active');
    // On mobile the sidebar is a horizontal bottom menu; keep the selected item visible.
    try { el.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' }); } catch (_) {}
  }
  const m={dashboard:renderDash,analytics:renderDataAnalytics,'master-data':renderMasterData,'quote-list':renderQLList,'invoice-list':renderIList,'receipt-list':()=>{populateInvRefs();renderRList();},'issued-invoice-list':renderIssuedInvoiceList,'issued-receipt-list':renderIssuedReceiptList,'expense-list':renderEList,'production-list':renderPList,'linked-flow':renderLinkedFlow,'receipt-form':populateInvRefs,'invoice-form':()=>populateProductionRefs(),'production-form':()=>populateQuoteRefs('p')};
  if(m[id])m[id]();
  if(id==='quote-form')refreshAutoDocumentNumber('quote');
  if(id==='invoice-form')refreshAutoDocumentNumber('invoice');
  if(id==='receipt-form')refreshAutoDocumentNumber('receipt');
  if(['dashboard','analytics','quote-list','invoice-list','receipt-list','issued-invoice-list','issued-receipt-list','expense-list','production-list','linked-flow','quote-form','production-form','invoice-form','receipt-form'].includes(id)){
    scheduleCloudSync(getCurrentSelectedYear());
  }
  if (window.innerWidth <= 900) {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }
}

// ============================================================
// BRANCH SELECTOR IN FORMS
// ============================================================
function getLockedUserBranch(){
  const profile = getCurrentProfile();
  return profile?.branch && profile.branch !== 'all' ? profile.branch : null;
}
function isTenantBranchActive(branch){return window.SaaSService?.isBranchActive?.(branch) ?? true;}
function tenantActiveBranchIds(){const rows=['ubon','khonkaen'].filter(isTenantBranchActive);return rows.length?rows:['ubon'];}

function applyBranchUi(form, b){
  formBranch[form]=b;
  const kk=document.getElementById(form+'-br-kk');
  const ub=document.getElementById(form+'-br-ub');
  if(kk)kk.className='br-opt'+(b==='khonkaen'?' kk-sel':'');
  if(ub)ub.className='br-opt'+(b==='ubon'?' ub-sel':'');
  document.getElementById(form+'-br-warn')?.classList.remove('show');
}

function lockBranchForStaff(){
  const locked = getLockedUserBranch();
  if(!locked)return;
  ['q','i','r','e','p'].forEach(form=>{
    applyBranchUi(form, locked);
    const kk=document.getElementById(form+'-br-kk');
    const ub=document.getElementById(form+'-br-ub');
    [kk,ub].forEach(el=>{
      if(!el)return;
      el.style.pointerEvents='none';
      el.style.opacity = el.id.endsWith(locked==='khonkaen'?'kk':'ub') ? '1' : '.45';
    });
  });
}

function selBr(form,b){
  if(!isTenantBranchActive(b)){
    notify('สาขานี้ยังไม่เปิดใช้งานในแพ็กเกจ กรุณาเพิ่มสิทธิ์สาขาก่อน');
    return;
  }
  const locked = getLockedUserBranch();
  if(locked && b !== locked){
    notify('บัญชีนี้ถูกผูกกับ '+BRANCH_TH[locked]+' จึงบันทึกได้เฉพาะสาขานี้');
    b = locked;
  }
  applyBranchUi(form,b);
  if(form==='r')populateInvRefs();
  if(form==='i'){populateProductionRefs();}
  if(form==='p')populateQuoteRefs('p');
}
function getBr(form){
  const locked = getLockedUserBranch();
  if(locked){
    applyBranchUi(form, locked);
    return locked;
  }
  if(!formBranch[form]){document.getElementById(form+'-br-warn')?.classList.add('show');return null;}
  return formBranch[form];
}

// ============================================================
// DASHBOARD
// ============================================================
function switchDashTab(t){
  if(t!=='all'&&!isTenantBranchActive(t)){
    notify('สาขานี้ยังไม่เปิดใช้งานในแพ็กเกจ');
    return;
  }
  dashTab=t;
  ['all','khonkaen','ubon'].forEach(x=>{
    document.getElementById('dt-'+(x==='khonkaen'?'kk':x==='ubon'?'ub':'all')).classList.toggle('active',x===t);
  });
  renderDash();
}

function branchStats(branch,year,monthVal){
  const months=monthVal===-1?Array.from({length:12},(_,i)=>i):[monthVal];
  let st=0,ct=0,cm=0,ex=0,qc=0,ic=0,pc=0;
  months.forEach(m=>{
    const d=loadFor(branch,year,m);
    const productions=dedupeRecords(d.productions||[]);

    // ยอดขายหลักของบริษัทมาจากใบสั่งผลิต/ฐานข้อมูลยอดขายย้อนหลัง
    // ไม่รวม invoices ซ้ำอีกครั้ง เพราะ invoice คือยอดส่งสินค้า ไม่ใช่ยอดขายก้อนใหม่
    st+=productions.reduce((s,e)=>s+productionNetSalesValue(e),0);
    ct+=productions.reduce((s,e)=>s+safeNum(e.costTotal??e.costSubtotal??e.costGrandTotal),0);
    cm+=productions.reduce((s,e)=>s+safeNum(e.commAmt),0);
    ex+=(d.expenses||[]).reduce((s,e)=>s+safeNum(e.amount),0);
    qc+=(d.quotes||[]).length;
    ic+=(d.invoices||[]).length;
    pc+=productions.length;
  });
  return{st,ct,cm,ex,net:st-ct-cm-ex,qc,ic,pc};
}

function renderDash(){
  const year=parseInt(document.getElementById('dash-year').value||now.getFullYear());
  const mVal=parseInt(document.getElementById('dash-month').value);
  const mLabel=mVal===-1?'ทุกเดือน':MONTHS[mVal];
  document.getElementById('dash-badge').textContent=mLabel+' พ.ศ. '+yearLabelDual(year);
  document.getElementById('topbar-ctx').textContent=mLabel+' พ.ศ. '+yearLabelDual(year);

  const kk=branchStats('khonkaen',year,mVal);
  const ub=branchStats('ubon',year,mVal);

  if(dashTab==='all'){
    document.getElementById('dash-combined').style.display='';
    document.getElementById('dash-single').style.display='none';
    const tSt=kk.st+ub.st,tCt=kk.ct+ub.ct,tCm=kk.cm+ub.cm,tEx=kk.ex+ub.ex,tNet=kk.net+ub.net;
    document.getElementById('metrics-total').innerHTML=
      mc('ยอดขายรวมก่อน VAT 2 สาขา (ข้อมูลหลัก)',fmt(tSt),'บาท','var(--blue)')+
      mc('ต้นทุนรวม',fmt(tCt),'บาท','var(--amber)')+
      mc('ค่าคอมมิสชัน',fmt(tCm),'บาท','var(--g2)')+
      mc('ค่าใช้จ่าย',fmt(tEx),'บาท','var(--red)')+
      mc('กำไรสุทธิรวม',fmt(tNet),'บาท',tNet>=0?'var(--green)':'var(--red)',tNet>=0?'var(--green-bd)':'var(--red-bd)');
    document.getElementById('dash-kk-rows').innerHTML=bRows(kk);
    document.getElementById('dash-ub-rows').innerHTML=bRows(ub);
  } else {
    document.getElementById('dash-combined').style.display='none';
    document.getElementById('dash-single').style.display='';
    const s=dashTab==='khonkaen'?kk:ub;
    const label=BRANCH_TH[dashTab];
    document.getElementById('metrics-single').innerHTML=
      mc(label+' — ยอดขายก่อน VAT (ข้อมูลหลัก)',fmt(s.st),'บาท','var(--blue)')+
      mc('ต้นทุน',fmt(s.ct),'บาท','var(--amber)')+
      mc('ค่าคอมมิสชัน',fmt(s.cm),'บาท','var(--g2)')+
      mc('ค่าใช้จ่าย',fmt(s.ex),'บาท','var(--red)')+
      mc('กำไรสุทธิ',fmt(s.net),'บาท',s.net>=0?'var(--green)':'var(--red)',s.net>=0?'var(--green-bd)':'var(--red-bd)');
  }

  // Recent docs
  const branches=dashTab==='all'?tenantActiveBranchIds():[dashTab];
  let allQ=[],allI=[];
  const mList=mVal===-1?Array.from({length:12},(_,i)=>i):[mVal];
  branches.forEach(br=>mList.forEach(m=>{
    const d=loadFor(br,year,m);
    allQ.push(...d.quotes.map(x=>({...x,branch:br})));
    allI.push(...d.invoices.map(x=>({...x,branch:br})));
  }));
  allQ.sort((a,b)=>b.id-a.id);allI.sort((a,b)=>b.id-a.id);

  document.getElementById('dash-quotes').innerHTML=allQ.slice(0,5).map(q=>
    `<div style="display:flex;align-items:center;gap:6px;padding:7px 0;border-bottom:1px solid var(--g4);font-size:13px">
      <div style="flex:1"><div>${q.no} ${bbr(q.branch)}</div><div style="font-size:11px;color:var(--g3)">${q.customer}</div></div>
      <span class="badge ${q.approved?'b-green':'b-amber'}">${q.approved?'อนุมัติ':'รอ'}</span>
      <span class="badge b-purple">฿${fmt(q.total)}</span>
    </div>`).join('')||'<div class="empty" style="padding:1rem">ยังไม่มีข้อมูล</div>';

  document.getElementById('dash-invs').innerHTML=allI.slice(0,5).map(i=>
    `<div style="display:flex;align-items:center;gap:6px;padding:7px 0;border-bottom:1px solid var(--g4);font-size:13px">
      <div style="flex:1"><div>${i.no} ${bbr(i.branch)}</div><div style="font-size:11px;color:var(--g3)">${i.customer}</div></div>
      <span class="badge b-green" title="ยอดขายก่อน VAT">฿${fmt(invoiceNetSales(i))}</span>
    </div>`).join('')||'<div class="empty" style="padding:1rem">ยังไม่มีข้อมูล</div>';

  renderDashboardComparison();
  renderDashCharts();
  renderDeliveryTargetDashboard();
  renderSalesTargetDashboard();
  renderSalesForecast();
  renderQuantDashboard();
  renderProductionDeliveryComparison();
}

function mc(lbl,val,sub,color,bc){return`<div class="mc" ${bc?`style="border-color:${bc}"`:''}><div class="lbl">${lbl}</div><div class="val" style="color:${color||'var(--g)'}">${val}</div><div class="sub">${sub}</div></div>`;}
function bRows(s){return`
  <div class="brow"><span>ยอดขายก่อน VAT</span><span style="color:var(--blue);font-weight:600">฿${fmt(s.st)}</span></div>
  <div class="brow"><span>ต้นทุน</span><span style="color:var(--amber)">฿${fmt(s.ct)}</span></div>
  <div class="brow"><span>ค่าคอมมิสชัน</span><span>฿${fmt(s.cm)}</span></div>
  <div class="brow"><span>ค่าใช้จ่าย</span><span style="color:var(--red)">฿${fmt(s.ex)}</span></div>
  <div class="brow"><span>กำไรสุทธิ</span><span class="${s.net>=0?'pos':'neg'}">฿${fmt(s.net)}</span></div>`;}
function bbr(b){return b?`<span class="badge ${b==='khonkaen'?'b-kk':'b-ub'}">${b==='khonkaen'?'สาขาที่ 00001':'สาขาสำนักงานใหญ่'}</span>`:'';}


function dashComparePct(current,base){
  const c=safeNum(current),b=safeNum(base);
  if(!b)return null;
  return (c-b)/Math.abs(b)*100;
}
function dashComparePctText(value){
  if(value===null||!Number.isFinite(Number(value)))return 'ยังเทียบไม่ได้';
  const n=Number(value);
  return `${n>=0?'+':''}${n.toFixed(1)}%`;
}
function dashCompareClass(value){
  if(value===null||!Number.isFinite(Number(value)))return 'neutral';
  if(value>2)return 'up';
  if(value<-2)return 'down';
  return 'neutral';
}
function dashMonthlyStatus(row={}){
  if(!safeNum(row.value)&&!safeNum(row.delivery)&&!safeNum(row.receipts))return{label:'ไม่มีข้อมูล',cls:'muted'};
  if(safeNum(row.profit)<0)return{label:'กำไรติดลบ',cls:'danger'};
  if(safeNum(row.deliveryRate)<80&&safeNum(row.value)>0)return{label:'ติดตามส่งมอบ',cls:'warn'};
  if(safeNum(row.collectionRate)<80&&safeNum(row.delivery)>0)return{label:'ติดตามรับเงิน',cls:'warn'};
  if(safeNum(row.margin)<5&&safeNum(row.value)>0)return{label:'Margin ต่ำ',cls:'warn'};
  return{label:'ปกติ',cls:'good'};
}
function dashCompareCard(label,value,mom,yoy,detail=''){
  const primary=mom!==null?mom:yoy;
  const cls=dashCompareClass(primary);
  return `<div class="dash-compare-card ${cls}">
    <div class="dcc-top"><span>${label}</span><span class="dcc-trend ${cls}">${primary===null?'—':dashComparePctText(primary)}</span></div>
    <b>${chartMoney(value)}</b>
    <div class="dcc-meta"><span>MoM ${dashComparePctText(mom)}</span><span>YoY ${dashComparePctText(yoy)}</span></div>
    ${detail?`<small>${detail}</small>`:''}
  </div>`;
}
function renderDashboardComparison(){
  const host=document.getElementById('dash-compare-kpis');
  const tableHost=document.getElementById('dash-monthly-compare-table');
  if(!host||!tableHost)return;
  const year=parseInt(document.getElementById('dash-year')?.value||now.getFullYear());
  const selectedMonth=parseInt(document.getElementById('dash-month')?.value??-1);
  const branch=dashTab==='all'?'':dashTab;
  const rows=analyticsMonthlySeries(year,branch);
  const priorRows=analyticsMonthlySeries(year-1,branch);
  const periodEl=document.getElementById('dash-compare-period');
  let current={},previous={},yoyBase={},periodLabel='';
  if(selectedMonth>=0){
    current=rows[selectedMonth]||{};
    previous=selectedMonth===0?(priorRows[11]||{}):(rows[selectedMonth-1]||{});
    yoyBase=priorRows[selectedMonth]||{};
    periodLabel=`${MONTHS[selectedMonth]} พ.ศ. ${yearLabelDual(year)}`;
  }else{
    const sum=(list,key)=>list.reduce((acc,row)=>acc+safeNum(row[key]),0);
    current={value:sum(rows,'value'),delivery:sum(rows,'delivery'),receipts:sum(rows,'receipts'),profit:sum(rows,'profit')};
    yoyBase={value:sum(priorRows,'value'),delivery:sum(priorRows,'delivery'),receipts:sum(priorRows,'receipts'),profit:sum(priorRows,'profit')};
    previous={};
    periodLabel=`ทั้งปี พ.ศ. ${yearLabelDual(year)}`;
  }
  if(periodEl)periodEl.textContent=`${dashTab==='all'?'รวมทั้ง 2 สาขา':BRANCH_TH[dashTab]} · ${periodLabel}`;
  const card=(label,key,detail)=>dashCompareCard(
    label,safeNum(current[key]),selectedMonth>=0?dashComparePct(current[key],previous[key]):null,dashComparePct(current[key],yoyBase[key]),detail
  );
  host.innerHTML=
    card('ยอดขายก่อน VAT','value','เทียบช่วงก่อนหน้าและช่วงเดียวกันปีก่อน')+
    card('ยอดส่งสินค้า','delivery','ช่วยดู Backlog และความสามารถในการส่งมอบ')+
    card('ยอดรับเงิน','receipts','ช่วยติดตาม Cash Collection')+
    card('กำไรสุทธิ','profit','ใช้ดูคุณภาพของยอดขาย ไม่ใช่ยอดขายอย่างเดียว');

  const enriched=rows.map((row,index)=>{
    const prev=index===0?priorRows[11]:rows[index-1];
    const yoy=priorRows[index]||{};
    return{...row,mom:dashComparePct(row.value,prev?.value),yoy:dashComparePct(row.value,yoy?.value),status:dashMonthlyStatus(row)};
  });
  tableHost.innerHTML=`<div class="dash-compare-table-wrap"><table class="dash-compare-table">
    <thead><tr><th>เดือน</th><th>ยอดขาย</th><th>MoM</th><th>YoY</th><th>ส่งสินค้า</th><th>Delivery</th><th>รับเงิน</th><th>Collection</th><th>กำไรสุทธิ</th><th>Net Margin</th><th>สถานะ</th></tr></thead>
    <tbody>${enriched.map(row=>`<tr class="${selectedMonth===row.month?'is-selected':''}">
      <td class="sticky-col"><b>${escapeHtml(row.label)}</b></td>
      <td class="num">${chartMoney(row.value)}</td>
      <td class="num"><span class="delta-pill ${dashCompareClass(row.mom)}">${dashComparePctText(row.mom)}</span></td>
      <td class="num"><span class="delta-pill ${dashCompareClass(row.yoy)}">${dashComparePctText(row.yoy)}</span></td>
      <td class="num">${chartMoney(row.delivery)}</td>
      <td class="num">${percentText(row.deliveryRate)}</td>
      <td class="num">${chartMoney(row.receipts)}</td>
      <td class="num">${percentText(row.collectionRate)}</td>
      <td class="num ${row.profit<0?'negative-value':'positive-value'}">${chartMoney(row.profit)}</td>
      <td class="num">${percentText(row.margin)}</td>
      <td><span class="status-pill ${row.status.cls}">${row.status.label}</span></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}


// ============================================================
// MONTHLY DELIVERY TARGET — เป้าหมายยอดส่งสินค้า จันทร์–ศุกร์
// ============================================================
const DELIVERY_TARGET_STORAGE_KEY='comform_delivery_targets_v2';
const DEFAULT_COMPANY_MONTHLY_TARGET=1600000;

// มกราคม–มิถุนายน 2569 ใช้ยอดขายย้อนหลังเป็นยอดส่งสินค้าแทน
// เพราะฐานข้อมูลนำเข้าจาก Excel ไม่มีใบส่งสินค้า / ใบกำกับภาษีแยกต่างหาก
// ช่วงดังกล่าวจึงกำหนดให้ทั้งยอดจริงและเป้าหมายส่งสินค้าเท่ากับยอดขาย
const HISTORICAL_SALES_DELIVERY_MIRROR=Object.freeze({
  enabled:true,
  year:2026,
  startMonthIndex:0,
  endMonthIndex:5
});

function shouldMirrorHistoricalSalesAsDelivery(year,month){
  return HISTORICAL_SALES_DELIVERY_MIRROR.enabled
    && Number(year)===HISTORICAL_SALES_DELIVERY_MIRROR.year
    && Number(month)>=HISTORICAL_SALES_DELIVERY_MIRROR.startMonthIndex
    && Number(month)<=HISTORICAL_SALES_DELIVERY_MIRROR.endMonthIndex;
}

function readDeliveryTargets(){
  const defaults={all:DEFAULT_COMPANY_MONTHLY_TARGET,khonkaen:0,ubon:0};
  try{
    const raw=localStorage.getItem(tenantLocalKey(DELIVERY_TARGET_STORAGE_KEY));
    if(!raw)return defaults;
    const parsed=JSON.parse(raw);
    return{
      all:Math.max(0,safeNum(parsed?.all??defaults.all)),
      khonkaen:Math.max(0,safeNum(parsed?.khonkaen??0)),
      ubon:Math.max(0,safeNum(parsed?.ubon??0))
    };
  }catch(error){
    console.warn('อ่านค่าเป้าหมายยอดส่งสินค้าไม่สำเร็จ',error);
    return defaults;
  }
}
function currentTargetScope(){return dashTab==='khonkaen'||dashTab==='ubon'?dashTab:'all';}
function currentDeliveryTarget(year,month){
  // เดือน ม.ค.–มิ.ย. 2569 เป้าหมายส่งสินค้าใช้ค่าเดียวกับเป้าหมายยอดขาย
  if(shouldMirrorHistoricalSalesAsDelivery(year,month))return currentSalesTarget();
  return readDeliveryTargets()[currentTargetScope()]||0;
}
function saveDeliveryTarget(){
  const input=document.getElementById('delivery-monthly-target');
  const value=Math.max(0,safeNum(input?.value));
  const {year,month}=targetPeriod();
  const scope=currentTargetScope();
  try{
    if(shouldMirrorHistoricalSalesAsDelivery(year,month)){
      // บันทึกไปยังเป้าหมายยอดขายเพื่อให้สองเป้าหมายเท่ากันเฉพาะช่วงย้อนหลัง
      const salesTargets=readSalesTargets();
      salesTargets[scope]=value;
      localStorage.setItem(tenantLocalKey(SALES_TARGET_STORAGE_KEY),JSON.stringify(salesTargets));
      renderSalesTargetDashboard();
    }else{
      const targets=readDeliveryTargets();
      targets[scope]=value;
      localStorage.setItem(tenantLocalKey(DELIVERY_TARGET_STORAGE_KEY),JSON.stringify(targets));
    }
    renderDeliveryTargetDashboard();
  }catch(error){
    console.error('บันทึกเป้าหมายไม่สำเร็จ',error);
    notify('บันทึกเป้าหมายไม่สำเร็จ: '+(error?.message||error));
  }
}
function targetPeriod(){
  const year=parseInt(document.getElementById('dash-year')?.value||now.getFullYear(),10);
  const selectedMonth=parseInt(document.getElementById('dash-month')?.value??-1,10);
  if(selectedMonth>=0)return{year,month:selectedMonth};
  if(year===now.getFullYear())return{year,month:now.getMonth()};
  return{year,month:11};
}
function dateKeyLocal(date){
  const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function parseBusinessDate(value){
  return parseFlexibleBusinessDate(value);
}
function isWeekday(date){const day=date.getDay();return day!==0&&day!==6;}
function businessDaysInMonth(year,month){
  const days=[];
  const last=new Date(year,month+1,0).getDate();
  for(let day=1;day<=last;day++){
    const date=new Date(year,month,day);
    if(isWeekday(date))days.push(date);
  }
  return days;
}
function targetInvoicesForPeriod(year,month,branches=dashBranches()){
  const rows=[];
  branches.forEach(branch=>{
    const store=loadFor(branch,year,month);
    dedupeRecords(store.invoices||[]).forEach(inv=>rows.push({...inv,branch}));
  });
  return rows;
}
function deliveryTargetKpi(label,value,detail,cls=''){
  return `<div class="target-kpi ${cls}"><div class="tk-label">${label}</div><div class="tk-value">${value}</div><div class="tk-detail">${detail}</div></div>`;
}
function buildDeliveryTargetDashboard(){
  const {year,month}=targetPeriod();
  const scope=currentTargetScope();
  const mirroredFromSales=shouldMirrorHistoricalSalesAsDelivery(year,month);
  const target=currentDeliveryTarget(year,month);
  const businessDays=businessDaysInMonth(year,month);
  const invoices=targetInvoicesForPeriod(year,month);
  const productions=mirroredFromSales?targetProductionsForPeriod(year,month):[];
  const sourceRows=mirroredFromSales?productions:invoices;
  const rowValue=mirroredFromSales?productionNetSalesValue:invoiceNetSales;
  const dailyMap=new Map();
  let undated=0;
  sourceRows.forEach(row=>{
    const value=rowValue(row);
    const date=parseBusinessDate(row.date);
    if(!date||date.getFullYear()!==year||date.getMonth()!==month){undated+=value;return;}
    const key=dateKeyLocal(date);
    dailyMap.set(key,(dailyMap.get(key)||0)+value);
  });
  const actual=sourceRows.reduce((sum,row)=>sum+rowValue(row),0);
  const today=new Date();
  const isCurrent=year===today.getFullYear()&&month===today.getMonth();
  const isPast=new Date(year,month+1,1)<=new Date(today.getFullYear(),today.getMonth(),1);
  const isFuture=new Date(year,month,1)>new Date(today.getFullYear(),today.getMonth(),1);
  let elapsedCount;
  if(isPast)elapsedCount=businessDays.length;
  else if(isFuture)elapsedCount=0;
  else elapsedCount=businessDays.filter(d=>d<=today).length;
  const remainingDays=isCurrent?businessDays.filter(d=>d>today).length:(isFuture?businessDays.length:0);
  const expectedByToday=businessDays.length?target*(elapsedCount/businessDays.length):0;
  const gap=Math.max(0,target-actual);
  const surplus=Math.max(0,actual-target);
  const requiredPerDay=remainingDays>0?gap/remainingDays:gap;
  const avgPerElapsed=elapsedCount>0?actual/elapsedCount:0;
  const projected=isPast?actual:(elapsedCount>0?avgPerElapsed*businessDays.length:0);
  const projectedGap=projected-target;
  const progress=target>0?actual/target*100:0;
  const pace=expectedByToday>0?actual/expectedByToday*100:(actual>0?100:0);
  const dayRows=[];
  let cumulative=undated;
  businessDays.forEach((date,index)=>{
    cumulative+=dailyMap.get(dateKeyLocal(date))||0;
    dayRows.push({
      date,index:index+1,
      actual:cumulative,
      target:target*((index+1)/Math.max(1,businessDays.length))
    });
  });
  let status='neutral',statusText='ยังไม่มีเป้าหมายสำหรับมุมมองนี้';
  if(target>0){
    if(actual>=target){status='success';statusText=`ทำได้เกินเป้าหมายแล้ว ${chartMoney(surplus)}`;}
    else if(isPast){status='danger';statusText=`ปิดเดือนต่ำกว่าเป้าหมาย ${chartMoney(gap)}`;}
    else if(projected>=target&&actual>=expectedByToday*.95){status='success';statusText='แนวโน้มอยู่ในเกณฑ์ที่จะถึงเป้าหมาย';}
    else if(actual>=expectedByToday*.85){status='warning';statusText=`ต่ำกว่าแผนเล็กน้อย ต้องเร่งอีก ${chartMoney(gap)}`;}
    else{status='danger';statusText=`ต่ำกว่าแผน ต้องเร่งยอดส่งสินค้าอีก ${chartMoney(gap)}`;}
  }
  return{year,month,scope,target,businessDays,invoices,productions,sourceRows,mirroredFromSales,actual,elapsedCount,remainingDays,expectedByToday,gap,surplus,requiredPerDay,avgPerElapsed,projected,projectedGap,progress,pace,dayRows,status,statusText,isCurrent,isPast,isFuture};
}
function renderTargetSvg(model){
  const rows=model.dayRows;
  if(!rows.length)return '<div class="empty">ไม่พบวันทำการในเดือนนี้</div>';
  const width=760,height=250,pad={l:56,r:18,t:20,b:38};
  const max=Math.max(model.target,...rows.map(r=>r.actual),1)*1.08;
  const x=i=>pad.l+(i/Math.max(1,rows.length-1))*(width-pad.l-pad.r);
  const y=v=>height-pad.b-(safeNum(v)/max)*(height-pad.t-pad.b);
  const targetPoints=rows.map((r,i)=>`${x(i).toFixed(1)},${y(r.target).toFixed(1)}`).join(' ');
  const actualPoints=rows.map((r,i)=>`${x(i).toFixed(1)},${y(r.actual).toFixed(1)}`).join(' ');
  const yTicks=[0,.25,.5,.75,1].map(p=>{
    const value=max*p,yy=y(value);
    return `<line x1="${pad.l}" y1="${yy}" x2="${width-pad.r}" y2="${yy}" class="target-grid-line"/><text x="${pad.l-8}" y="${yy+4}" text-anchor="end" class="target-axis-text">${Math.round(value/1000).toLocaleString('th-TH')}k</text>`;
  }).join('');
  const tickIndexes=[0,Math.floor((rows.length-1)/2),rows.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  const xTicks=tickIndexes.map(i=>`<text x="${x(i)}" y="${height-13}" text-anchor="middle" class="target-axis-text">${rows[i].date.getDate()} ${MONTHS[model.month].slice(0,3)}</text>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    ${yTicks}${xTicks}
    <polyline points="${targetPoints}" class="target-line-plan"/>
    <polyline points="${actualPoints}" class="target-line-actual"/>
  </svg>
  <div class="target-chart-legend"><span><i class="actual"></i>ยอดส่งจริงสะสม</span><span><i class="plan"></i>เป้าหมายสะสมตามวันทำการ</span></div>`;
}
function renderDeliveryTargetDashboard(){
  const host=document.getElementById('target-metrics');if(!host)return;
  const m=buildDeliveryTargetDashboard();
  const input=document.getElementById('delivery-monthly-target');
  if(input)input.value=m.target||'';
  const scopeLabel=m.scope==='all'?'รวมทั้ง 2 สาขา':BRANCH_TH[m.scope];
  const scopeNote=document.getElementById('target-scope-note');
  if(scopeNote)scopeNote.textContent=m.target>0?`ใช้กับ ${scopeLabel}`:`ยังไม่ได้กำหนดเป้าหมายสำหรับ ${scopeLabel}`;
  document.getElementById('target-period-label').textContent=`${MONTHS[m.month]} พ.ศ. ${yearLabelDual(m.year)} · ${scopeLabel}`;
  const projectedClass=m.target&&m.projected>=m.target?'positive':'negative';
  host.innerHTML=
    deliveryTargetKpi('เป้าหมายเดือนนี้',m.target?chartMoney(m.target):'ยังไม่กำหนด',`${m.businessDays.length} วันทำการ`,'target')+
    deliveryTargetKpi('ส่งสินค้าแล้ว',chartMoney(m.actual),m.target?`${Math.min(999,m.progress).toFixed(1)}% ของเป้าหมาย`:(m.mirroredFromSales?`${m.productions.length} รายการยอดขายย้อนหลัง`:`${m.invoices.length} บิล`),'actual')+
    deliveryTargetKpi(m.actual>=m.target&&m.target>0?'เกินเป้าหมาย':'ยอดที่ยังขาด',chartMoney(m.actual>=m.target&&m.target>0?m.surplus:m.gap),`ควรได้ตามเวลา ${chartMoney(m.expectedByToday)}`,m.actual>=m.target&&m.target>0?'positive':'gap')+
    deliveryTargetKpi('ต้องส่งเฉลี่ยต่อวัน',m.remainingDays>0?chartMoney(m.requiredPerDay):(m.gap>0?chartMoney(m.gap):chartMoney(0)),`${m.remainingDays} วันทำการที่เหลือ`,'daily')+
    deliveryTargetKpi('คาดการณ์สิ้นเดือน',chartMoney(m.projected),m.target?`${m.projectedGap>=0?'เกิน':'ขาด'} ${chartMoney(Math.abs(m.projectedGap))}`:'ตั้งเป้าหมายเพื่อเปรียบเทียบ',projectedClass);

  const banner=document.getElementById('target-status-banner');
  banner.className=`target-status-banner ${m.status}`;
  banner.innerHTML=`<strong>${m.statusText}</strong><span>${m.mirroredFromSales?'ยอดส่งสินค้าใช้ยอดขายย้อนหลังเป็นค่าทดแทน · ':''}ความเร็วเทียบแผน ${m.pace.toFixed(1)}% · ส่งเฉลี่ย ${chartMoney(m.avgPerElapsed)} ต่อวันทำการที่ผ่านมา</span>`;

  const progress=Math.max(0,Math.min(100,m.progress));
  document.getElementById('target-progress').innerHTML=`
    <div class="target-progress-label"><span>ความคืบหน้า</span><b>${m.target?m.progress.toFixed(1):'0.0'}%</b></div>
    <div class="target-progress-track"><div class="target-progress-fill ${m.status}" style="width:${progress}%"></div></div>
    <div class="target-progress-values"><span>${chartMoney(m.actual)}</span><span>${m.target?chartMoney(m.target):'ยังไม่กำหนดเป้าหมาย'}</span></div>`;
  document.getElementById('target-chart').innerHTML=renderTargetSvg(m);
  document.getElementById('target-chart-note').textContent=m.mirroredFromSales
    ?'มกราคม–มิถุนายน 2569 ใช้ยอดขายย้อนหลังเป็นยอดส่งสินค้าแทน เพื่อให้ยอดและเป้าหมายทั้งสองส่วนเท่ากัน โดยไม่สร้างใบส่งสินค้า / ใบกำกับภาษีซ้ำใน Firebase'
    :'คำนวณเฉพาะวันจันทร์–ศุกร์ ยังไม่หักวันหยุดนักขัตฤกษ์หรือวันหยุดพิเศษของบริษัท';

  document.getElementById('target-workday-summary').innerHTML=`
    <div class="target-workday-grid">
      <div><span>วันทำการทั้งหมด</span><b>${m.businessDays.length} วัน</b></div>
      <div><span>วันทำการผ่านไป</span><b>${m.elapsedCount} วัน</b></div>
      <div><span>วันทำการที่เหลือ</span><b>${m.remainingDays} วัน</b></div>
      <div><span>ยอดที่ควรได้ถึงวันนี้</span><b>${chartMoney(m.expectedByToday)}</b></div>
      <div><span>ยอดเฉลี่ยที่ผ่านมา</span><b>${chartMoney(m.avgPerElapsed)}/วัน</b></div>
      <div><span>ยอดที่ต้องทำต่อวัน</span><b>${chartMoney(m.requiredPerDay)}/วัน</b></div>
    </div>`;
  const alerts=[];
  if(m.mirroredFromSales)alerts.push({cls:'good',text:'ช่วง ม.ค.–มิ.ย. 2569 ระบบกำหนดยอดส่งสินค้าและเป้าหมายส่งสินค้าให้เท่ากับยอดขายย้อนหลังโดยอัตโนมัติ'});
  if(!m.target)alerts.push({cls:'warn',text:`กรุณากำหนดเป้าหมายสำหรับ ${scopeLabel} เพื่อเริ่มวัดผล`});
  else if(m.actual>=m.target)alerts.push({cls:'good',text:`ถึงเป้าหมายแล้ว ควรรักษาคุณภาพการส่งมอบและตรวจสอบกำไรของยอดส่วนเกิน ${chartMoney(m.surplus)}`});
  else{
    if(m.projected<m.target)alerts.push({cls:'danger',text:`จากความเร็วปัจจุบัน คาดว่าสิ้นเดือนจะขาด ${chartMoney(Math.abs(m.projectedGap))}`});
    else alerts.push({cls:'good',text:'จากความเร็วปัจจุบัน มีแนวโน้มทำยอดได้ถึงเป้าหมาย'});
    if(m.remainingDays>0)alerts.push({cls:'warn',text:`ต้องส่งสินค้าเฉลี่ยอย่างน้อย ${chartMoney(m.requiredPerDay)} ต่อวันทำการที่เหลือ`});
    if(m.actual<m.expectedByToday)alerts.push({cls:'danger',text:`ยอดจริงต่ำกว่าเส้นเป้าหมายตามเวลา ${chartMoney(m.expectedByToday-m.actual)}`});
    else alerts.push({cls:'good',text:`ยอดจริงนำหน้าเส้นเป้าหมายตามเวลา ${chartMoney(m.actual-m.expectedByToday)}`});
  }
  document.getElementById('target-alerts').innerHTML=alerts.map(a=>`<div class="target-alert ${a.cls}">${a.text}</div>`).join('');
}



// ============================================================
// MONTHLY SALES TARGET — เป้าหมายยอดขายจากใบสั่งผลิต จันทร์–ศุกร์
// ============================================================
const SALES_TARGET_STORAGE_KEY='comform_sales_targets_v1';
const DEFAULT_COMPANY_MONTHLY_SALES_TARGET=2000000;

function readSalesTargets(){
  const defaults={all:DEFAULT_COMPANY_MONTHLY_SALES_TARGET,khonkaen:0,ubon:0};
  try{
    const raw=localStorage.getItem(tenantLocalKey(SALES_TARGET_STORAGE_KEY));
    if(!raw)return defaults;
    const parsed=JSON.parse(raw);
    return{
      all:Math.max(0,safeNum(parsed?.all??defaults.all)),
      khonkaen:Math.max(0,safeNum(parsed?.khonkaen??0)),
      ubon:Math.max(0,safeNum(parsed?.ubon??0))
    };
  }catch(error){
    console.warn('อ่านค่าเป้าหมายยอดขายไม่สำเร็จ',error);
    return defaults;
  }
}
function currentSalesTarget(){return readSalesTargets()[currentTargetScope()]||0;}
function saveSalesTarget(){
  const input=document.getElementById('sales-monthly-target');
  const value=Math.max(0,safeNum(input?.value));
  const targets=readSalesTargets();
  targets[currentTargetScope()]=value;
  try{
    localStorage.setItem(tenantLocalKey(SALES_TARGET_STORAGE_KEY),JSON.stringify(targets));
    renderSalesTargetDashboard();
  }catch(error){
    console.error('บันทึกเป้าหมายยอดขายไม่สำเร็จ',error);
    notify('บันทึกเป้าหมายยอดขายไม่สำเร็จ: '+(error?.message||error));
  }
}
function productionNetSalesValue(record={}){
  const subtotal=safeNum(record.subtotal);
  if(subtotal)return subtotal;
  if(record.schemaVersion===2)return 0;
  return safeNum(record.total||record.saleTotal||record.itemSaleTotal);
}
function targetProductionsForPeriod(year,month,branches=dashBranches()){
  const rows=[];
  branches.forEach(branch=>{
    const store=loadFor(branch,year,month);
    dedupeRecords(store.productions||[]).forEach(row=>rows.push({...row,branch}));
  });
  return rows;
}
function buildSalesTargetDashboard(){
  const {year,month}=targetPeriod();
  const scope=currentTargetScope();
  const target=currentSalesTarget();
  const businessDays=businessDaysInMonth(year,month);
  const productions=targetProductionsForPeriod(year,month);
  const dailyMap=new Map();
  let undated=0;
  productions.forEach(row=>{
    const value=productionNetSalesValue(row);
    const date=parseBusinessDate(row.date);
    if(!date||date.getFullYear()!==year||date.getMonth()!==month){undated+=value;return;}
    const key=dateKeyLocal(date);
    dailyMap.set(key,(dailyMap.get(key)||0)+value);
  });
  const actual=productions.reduce((sum,row)=>sum+productionNetSalesValue(row),0);
  const deliveryModel=buildDeliveryTargetDashboard();
  const today=new Date();
  const isCurrent=year===today.getFullYear()&&month===today.getMonth();
  const isPast=new Date(year,month+1,1)<=new Date(today.getFullYear(),today.getMonth(),1);
  const isFuture=new Date(year,month,1)>new Date(today.getFullYear(),today.getMonth(),1);
  let elapsedCount;
  if(isPast)elapsedCount=businessDays.length;
  else if(isFuture)elapsedCount=0;
  else elapsedCount=businessDays.filter(d=>d<=today).length;
  const remainingDays=isCurrent?businessDays.filter(d=>d>today).length:(isFuture?businessDays.length:0);
  const expectedByToday=businessDays.length?target*(elapsedCount/businessDays.length):0;
  const gap=Math.max(0,target-actual);
  const surplus=Math.max(0,actual-target);
  const requiredPerDay=remainingDays>0?gap/remainingDays:gap;
  const avgPerElapsed=elapsedCount>0?actual/elapsedCount:0;
  const projected=isPast?actual:(elapsedCount>0?avgPerElapsed*businessDays.length:0);
  const projectedGap=projected-target;
  const progress=target>0?actual/target*100:0;
  const pace=expectedByToday>0?actual/expectedByToday*100:(actual>0?100:0);
  const deliveryRate=actual>0?deliveryModel.actual/actual*100:0;
  const targetDeliveryRate=target>0?deliveryModel.target/target*100:0;
  const notDelivered=Math.max(0,actual-deliveryModel.actual);
  const dayRows=[];
  let cumulative=undated;
  businessDays.forEach((date,index)=>{
    cumulative+=dailyMap.get(dateKeyLocal(date))||0;
    dayRows.push({date,index:index+1,actual:cumulative,target:target*((index+1)/Math.max(1,businessDays.length))});
  });
  let status='neutral',statusText='ยังไม่มีเป้าหมายสำหรับมุมมองนี้';
  if(target>0){
    if(actual>=target){status='success';statusText=`ทำยอดขายเกินเป้าหมายแล้ว ${chartMoney(surplus)}`;}
    else if(isPast){status='danger';statusText=`ปิดเดือนต่ำกว่าเป้าหมายยอดขาย ${chartMoney(gap)}`;}
    else if(projected>=target&&actual>=expectedByToday*.95){status='success';statusText='แนวโน้มยอดขายอยู่ในเกณฑ์ที่จะถึงเป้าหมาย';}
    else if(actual>=expectedByToday*.85){status='warning';statusText=`ยอดขายต่ำกว่าแผนเล็กน้อย ต้องเร่งอีก ${chartMoney(gap)}`;}
    else{status='danger';statusText=`ยอดขายต่ำกว่าแผน ต้องเร่งอีก ${chartMoney(gap)}`;}
  }
  return{year,month,scope,target,businessDays,productions,actual,elapsedCount,remainingDays,expectedByToday,gap,surplus,requiredPerDay,avgPerElapsed,projected,projectedGap,progress,pace,dayRows,status,statusText,isCurrent,isPast,isFuture,deliveryModel,deliveryRate,targetDeliveryRate,notDelivered};
}
function renderSalesTargetDashboard(){
  const host=document.getElementById('sales-target-metrics');if(!host)return;
  const m=buildSalesTargetDashboard();
  const input=document.getElementById('sales-monthly-target');
  if(input)input.value=m.target||'';
  const scopeLabel=m.scope==='all'?'รวมทั้ง 2 สาขา':BRANCH_TH[m.scope];
  const scopeNote=document.getElementById('sales-target-scope-note');
  if(scopeNote)scopeNote.textContent=m.target>0?`ใช้กับ ${scopeLabel}`:`ยังไม่ได้กำหนดเป้าหมายสำหรับ ${scopeLabel}`;
  document.getElementById('sales-target-period-label').textContent=`${MONTHS[m.month]} พ.ศ. ${yearLabelDual(m.year)} · ${scopeLabel}`;
  const projectedClass=m.target&&m.projected>=m.target?'positive':'negative';
  host.innerHTML=
    deliveryTargetKpi('เป้าหมายยอดขาย',m.target?chartMoney(m.target):'ยังไม่กำหนด',`${m.businessDays.length} วันทำการ`,'target')+
    deliveryTargetKpi('ยอดขายแล้ว',chartMoney(m.actual),m.target?`${Math.min(999,m.progress).toFixed(1)}% ของเป้าหมาย`:`${m.productions.length} ใบสั่งผลิต`,'actual')+
    deliveryTargetKpi(m.actual>=m.target&&m.target>0?'เกินเป้าหมาย':'ยอดขายที่ยังขาด',chartMoney(m.actual>=m.target&&m.target>0?m.surplus:m.gap),`ควรได้ตามเวลา ${chartMoney(m.expectedByToday)}`,m.actual>=m.target&&m.target>0?'positive':'gap')+
    deliveryTargetKpi('ยอดขายต้องทำต่อวัน',m.remainingDays>0?chartMoney(m.requiredPerDay):(m.gap>0?chartMoney(m.gap):chartMoney(0)),`${m.remainingDays} วันทำการที่เหลือ`,'daily')+
    deliveryTargetKpi('คาดการณ์ยอดขายสิ้นเดือน',chartMoney(m.projected),m.target?`${m.projectedGap>=0?'เกิน':'ขาด'} ${chartMoney(Math.abs(m.projectedGap))}`:'ตั้งเป้าหมายเพื่อเปรียบเทียบ',projectedClass);

  const banner=document.getElementById('sales-target-status-banner');
  banner.className=`target-status-banner ${m.status}`;
  banner.innerHTML=`<strong>${m.statusText}</strong><span>ส่งมอบแล้ว ${m.deliveryRate.toFixed(1)}% ของยอดขาย · เป้าหมายส่งมอบคิดเป็น ${m.targetDeliveryRate.toFixed(1)}% ของเป้าหมายยอดขาย</span>`;

  const progress=Math.max(0,Math.min(100,m.progress));
  document.getElementById('sales-target-progress').innerHTML=`
    <div class="target-progress-label"><span>ความคืบหน้าเป้าหมายยอดขาย</span><b>${m.target?m.progress.toFixed(1):'0.0'}%</b></div>
    <div class="target-progress-track"><div class="target-progress-fill sales ${m.status}" style="width:${progress}%"></div></div>
    <div class="target-progress-values"><span>${chartMoney(m.actual)}</span><span>${m.target?chartMoney(m.target):'ยังไม่กำหนดเป้าหมาย'}</span></div>`;
  document.getElementById('sales-target-chart').innerHTML=renderTargetSvg(m).replace('ยอดส่งจริงสะสม','ยอดขายจริงสะสม');
  document.getElementById('sales-target-chart-note').textContent=m.deliveryModel?.mirroredFromSales
    ?'มกราคม–มิถุนายน 2569 ยอดส่งสินค้าใช้ยอดเดียวกับยอดขายย้อนหลัง เพื่อให้ยอดและเป้าหมายเท่ากันโดยไม่สร้างเอกสารซ้ำใน Firebase'
    :'ยอดขายคำนวณจากมูลค่าขายก่อน VAT ของใบสั่งผลิต ส่วนยอดส่งสินค้าคำนวณจากใบส่งสินค้า / ใบกำกับภาษี จึงไม่รวมตัวเลขสองชุดเข้าด้วยกัน';

  document.getElementById('sales-target-workday-summary').innerHTML=`
    <div class="target-workday-grid">
      <div><span>ยอดขายจริง</span><b>${chartMoney(m.actual)}</b></div>
      <div><span>ยอดส่งสินค้าจริง</span><b>${chartMoney(m.deliveryModel.actual)}</b></div>
      <div><span>ยอดขายที่ยังไม่ส่ง</span><b>${chartMoney(m.notDelivered)}</b></div>
      <div><span>อัตราส่งมอบต่อยอดขาย</span><b>${m.deliveryRate.toFixed(1)}%</b></div>
      <div><span>ยอดขายเฉลี่ยที่ผ่านมา</span><b>${chartMoney(m.avgPerElapsed)}/วัน</b></div>
      <div><span>ยอดขายที่ต้องทำต่อวัน</span><b>${chartMoney(m.requiredPerDay)}/วัน</b></div>
    </div>`;
  const alerts=[];
  if(!m.target)alerts.push({cls:'warn',text:`กรุณากำหนดเป้าหมายยอดขายสำหรับ ${scopeLabel}`});
  else{
    if(m.projected<m.target)alerts.push({cls:'danger',text:`จากความเร็วปัจจุบัน คาดว่ายอดขายสิ้นเดือนจะขาด ${chartMoney(Math.abs(m.projectedGap))}`});
    else alerts.push({cls:'good',text:'จากความเร็วปัจจุบัน มีแนวโน้มทำยอดขายถึงเป้าหมาย'});
    if(m.deliveryModel?.mirroredFromSales)alerts.push({cls:'good',text:'ช่วง ม.ค.–มิ.ย. 2569 ระบบสะท้อนยอดขายย้อนหลังไปเป็นยอดส่งสินค้าแล้ว ยอดทั้งสองส่วนจึงเท่ากัน'});
    else if(m.notDelivered>0)alerts.push({cls:'warn',text:`มียอดขายที่ยังไม่เปลี่ยนเป็นยอดส่งสินค้า ${chartMoney(m.notDelivered)} ควรติดตามแผนผลิตและกำหนดส่ง`});
    if(m.deliveryRate<m.targetDeliveryRate*.9&&m.actual>0)alerts.push({cls:'danger',text:`อัตราส่งมอบ ${m.deliveryRate.toFixed(1)}% ต่ำกว่าสัดส่วนเป้าหมาย ${m.targetDeliveryRate.toFixed(1)}%`});
    else if(m.actual>0)alerts.push({cls:'good',text:`อัตราส่งมอบต่อยอดขายอยู่ที่ ${m.deliveryRate.toFixed(1)}%`});
  }
  document.getElementById('sales-target-alerts').innerHTML=alerts.map(a=>`<div class="target-alert ${a.cls}">${a.text}</div>`).join('');
}

// ============================================================
// SALES FORECAST — มาตรฐาน Time-series Forecasting
// Auto เลือกโมเดลจาก Rolling-origin Cross-validation โดยใช้ RMSE ต่ำสุด
// ============================================================
function forecastMonthKey(year,month){return year*12+month;}
function forecastMonthFromKey(key){return{year:Math.floor(key/12),month:key%12};}
function forecastMonthLabel(year,month){return `${MONTHS[month]} พ.ศ. ${yearLabelDual(year)}`;}
function forecastSalesForMonth(year,month,branches=dashBranches()){
  return branches.reduce((sum,br)=>sum+metricFromData(loadFor(br,year,month),'sales',year,month),0);
}
function forecastQuotePipeline(year,month,branches=dashBranches()){
  let total=0,count=0;
  branches.forEach(br=>{
    const d=loadFor(br,year,month);
    (d.quotes||[]).forEach(q=>{
      if(!q.approved){total+=safeNum(q.subtotal||q.total);count+=1;}
    });
  });
  const history=quantHistoricalQuoteApproval(year,month,branches,24);
  const probability=history.probability;
  return{total,count,probability,weighted:roundMoneyValue(total*probability),history};
}
function forecastReferencePeriod(){
  const selectedYear=parseInt(document.getElementById('dash-year')?.value||now.getFullYear());
  const selectedMonth=parseInt(document.getElementById('dash-month')?.value??-1);
  if(selectedMonth>=0)return{year:selectedYear,month:selectedMonth,explicit:true};
  if(selectedYear===now.getFullYear()){
    const key=forecastMonthKey(selectedYear,now.getMonth())-1;
    return{...forecastMonthFromKey(key),explicit:false};
  }
  return{year:selectedYear,month:11,explicit:false};
}
function forecastActiveSeries(values=[]){
  const raw=values.map(v=>Math.max(0,safeNum(v)));
  let first=raw.findIndex(v=>v>0),last=-1;
  for(let i=raw.length-1;i>=0;i--){if(raw[i]>0){last=i;break;}}
  if(first<0||last<0)return[];
  return raw.slice(first,last+1);
}
function forecastMean(values=[]){return values.length?values.reduce((s,v)=>s+safeNum(v),0)/values.length:0;}
function forecastRmse(actual=[],pred=[]){
  if(!actual.length)return Infinity;
  return Math.sqrt(actual.reduce((s,a,i)=>s+Math.pow(safeNum(a)-safeNum(pred[i]),2),0)/actual.length);
}
function forecastMae(actual=[],pred=[]){
  if(!actual.length)return Infinity;
  return actual.reduce((s,a,i)=>s+Math.abs(safeNum(a)-safeNum(pred[i])),0)/actual.length;
}
function forecastSmape(actual=[],pred=[]){
  if(!actual.length)return Infinity;
  let total=0,count=0;
  actual.forEach((a,i)=>{
    const av=Math.abs(safeNum(a)),pv=Math.abs(safeNum(pred[i]));
    const denom=(av+pv)/2;
    if(denom>0){total+=Math.abs(av-pv)/denom*100;count++;}
  });
  return count?total/count:0;
}
function forecastMaseScale(values=[]){
  const v=forecastActiveSeries(values);
  if(v.length<2)return 0;
  return v.slice(1).reduce((s,x,i)=>s+Math.abs(x-v[i]),0)/(v.length-1);
}
function forecastMase(actual=[],pred=[],training=[]){
  if(!actual.length)return Infinity;
  const scale=forecastMaseScale(training);
  if(!scale)return Infinity;
  return forecastMae(actual,pred)/scale;
}
function forecastWape(actual=[],pred=[]){
  if(!actual.length)return Infinity;
  const denom=actual.reduce((s,a)=>s+Math.abs(safeNum(a)),0);
  if(!denom)return Infinity;
  return actual.reduce((s,a,i)=>s+Math.abs(safeNum(a)-safeNum(pred[i])),0)/denom*100;
}
function forecastBias(actual=[],pred=[]){
  if(!actual.length)return{mean:0,pct:0,cumulative:0};
  const errors=actual.map((a,i)=>safeNum(a)-safeNum(pred[i]));
  const cumulative=errors.reduce((s,e)=>s+e,0);
  const denom=actual.reduce((s,a)=>s+Math.abs(safeNum(a)),0);
  return{mean:cumulative/actual.length,pct:denom?cumulative/denom*100:0,cumulative};
}
function forecastTrackingSignal(actual=[],pred=[]){
  if(!actual.length)return 0;
  const errors=actual.map((a,i)=>safeNum(a)-safeNum(pred[i]));
  const cumulative=errors.reduce((s,e)=>s+e,0);
  const mad=errors.reduce((s,e)=>s+Math.abs(e),0)/errors.length;
  return mad?cumulative/mad:0;
}
function forecastBiasDiagnostic(row={}){
  if(!row.eligible)return{label:'ข้อมูลไม่พอ',cls:'muted',detail:row.reason||''};
  const ts=safeNum(row.trackingSignal),bias=safeNum(row.biasPct),wape=safeNum(row.wape);
  if(Math.abs(ts)>=4)return{label:ts>0?'Under-forecast ต่อเนื่อง':'Over-forecast ต่อเนื่อง',cls:'danger',detail:`Tracking Signal ${ts.toFixed(2)} เกินกรอบ ±4`};
  if(Math.abs(bias)>=10)return{label:bias>0?'Bias ต่ำกว่าจริง':'Bias สูงกว่าจริง',cls:'warn',detail:`Bias ${bias>=0?'+':''}${bias.toFixed(1)}%`};
  if(wape<=20)return{label:'สมดุลดี',cls:'good',detail:`WAPE ${wape.toFixed(1)}% · Bias อยู่ในกรอบ`};
  return{label:'ควรติดตาม',cls:'neutral',detail:`WAPE ${wape.toFixed(1)}% · TS ${ts.toFixed(2)}`};
}
function forecastSma(values=[],horizon=1,windowSize=3){
  const v=forecastActiveSeries(values);
  if(!v.length)return Array.from({length:horizon},()=>0);
  const avg=forecastMean(v.slice(-Math.min(windowSize,v.length)));
  return Array.from({length:horizon},()=>Math.max(0,avg));
}
function forecastSesFit(values=[],horizon=1){
  const v=forecastActiveSeries(values);
  if(!v.length)return{forecast:Array.from({length:horizon},()=>0),alpha:.2,sse:0};
  if(v.length===1)return{forecast:Array.from({length:horizon},()=>v[0]),alpha:.2,sse:0};
  let best=null;
  for(let ai=1;ai<=19;ai++){
    const alpha=ai*.05;
    let level=v[0],sse=0;
    for(let t=1;t<v.length;t++){
      const pred=level,err=v[t]-pred;sse+=err*err;
      level=alpha*v[t]+(1-alpha)*level;
    }
    if(!best||sse<best.sse)best={alpha,level,sse};
  }
  return{forecast:Array.from({length:horizon},()=>Math.max(0,best.level)),alpha:best.alpha,sse:best.sse};
}
function forecastHoltFit(values=[],horizon=1){
  const v=forecastActiveSeries(values);
  if(!v.length)return{forecast:Array.from({length:horizon},()=>0),alpha:.3,beta:.1,phi:.9,sse:0};
  if(v.length<2)return{forecast:Array.from({length:horizon},()=>v[0]),alpha:.3,beta:.1,phi:.9,sse:0};
  let best=null;
  const params=[.1,.2,.3,.4,.5,.6,.7,.8,.9],phis=[.8,.9,.95,.98];
  for(const alpha of params)for(const beta of params)for(const phi of phis){
    let level=v[0],trend=v[1]-v[0],sse=0;
    for(let t=1;t<v.length;t++){
      const pred=level+phi*trend,err=v[t]-pred;sse+=err*err;
      const newLevel=alpha*v[t]+(1-alpha)*(level+phi*trend);
      const newTrend=beta*(newLevel-level)+(1-beta)*phi*trend;
      level=newLevel;trend=newTrend;
    }
    if(!best||sse<best.sse)best={alpha,beta,phi,level,trend,sse};
  }
  const future=[];
  for(let h=1;h<=horizon;h++){
    let damp=0;
    for(let i=1;i<=h;i++)damp+=Math.pow(best.phi,i);
    future.push(Math.max(0,best.level+damp*best.trend));
  }
  return{forecast:future,alpha:best.alpha,beta:best.beta,phi:best.phi,sse:best.sse};
}
function forecastHoltWintersFit(values=[],horizon=1,seasonLength=12){
  const v=forecastActiveSeries(values);
  if(v.length<seasonLength*2)return{forecast:[],alpha:null,beta:null,gamma:null,sse:Infinity,eligible:false};
  const firstAvg=forecastMean(v.slice(0,seasonLength));
  const secondAvg=forecastMean(v.slice(seasonLength,seasonLength*2));
  const initialTrend=(secondAvg-firstAvg)/seasonLength;
  const initialSeason=Array.from({length:seasonLength},(_,i)=>v[i]-firstAvg);
  const grid=[.2,.4,.6,.8];
  let best=null;
  for(const alpha of grid)for(const beta of grid)for(const gamma of grid){
    let level=firstAvg,trend=initialTrend,sse=0;
    const seasonal=initialSeason.slice();
    for(let t=seasonLength;t<v.length;t++){
      const idx=t%seasonLength,s=seasonal[idx]||0;
      const pred=level+trend+s,err=v[t]-pred;sse+=err*err;
      const newLevel=alpha*(v[t]-s)+(1-alpha)*(level+trend);
      const newTrend=beta*(newLevel-level)+(1-beta)*trend;
      const newSeason=gamma*(v[t]-newLevel)+(1-gamma)*s;
      level=newLevel;trend=newTrend;seasonal[idx]=newSeason;
    }
    if(!best||sse<best.sse)best={alpha,beta,gamma,level,trend,seasonal,sse};
  }
  const future=[];
  for(let h=1;h<=horizon;h++){
    const idx=(v.length+h-1)%seasonLength;
    future.push(Math.max(0,best.level+h*best.trend+(best.seasonal[idx]||0)));
  }
  return{forecast:future,alpha:best.alpha,beta:best.beta,gamma:best.gamma,sse:best.sse,eligible:true};
}
function forecastLinearFit(values=[],horizon=1){
  const v=forecastActiveSeries(values);
  if(!v.length)return{forecast:Array.from({length:horizon},()=>0),slope:0,r2:0};
  if(v.length===1)return{forecast:Array.from({length:horizon},()=>v[0]),slope:0,r2:0};
  const n=v.length,xMean=(n-1)/2,yMean=forecastMean(v);
  let num=0,den=0;
  v.forEach((y,x)=>{num+=(x-xMean)*(y-yMean);den+=(x-xMean)**2;});
  const slope=den?num/den:0,intercept=yMean-slope*xMean;
  const ssTot=v.reduce((s,y)=>s+Math.pow(y-yMean,2),0);
  const ssRes=v.reduce((s,y,x)=>s+Math.pow(y-(intercept+slope*x),2),0);
  const r2=ssTot?Math.max(0,Math.min(1,1-ssRes/ssTot)):0;
  return{forecast:Array.from({length:horizon},(_,i)=>Math.max(0,intercept+slope*(n+i))),slope,r2:r2*100};
}
function forecastModelLabel(id){return({sma:'Moving Average 3 เดือน',ses:'Simple Exponential Smoothing',holt:'Holt Trend (Damped)',hw:'Holt-Winters Additive (12 เดือน)',linear:'Linear Regression (Benchmark)'})[id]||id;}
function forecastModelMinHistory(id){return id==='hw'?24:id==='holt'?6:id==='linear'?4:3;}
function forecastModelRun(id,values,horizon=1){
  if(id==='sma')return{forecast:forecastSma(values,horizon,3),params:'window=3'};
  if(id==='ses'){
    const fit=forecastSesFit(values,horizon);return{forecast:fit.forecast,params:`α=${fit.alpha?.toFixed(2)}`};
  }
  if(id==='holt'){
    const fit=forecastHoltFit(values,horizon);return{forecast:fit.forecast,params:`α=${fit.alpha?.toFixed(2)}, β=${fit.beta?.toFixed(2)}, φ=${fit.phi?.toFixed(2)}`};
  }
  if(id==='hw'){
    const fit=forecastHoltWintersFit(values,horizon,12);return{forecast:fit.forecast,params:fit.eligible?`α=${fit.alpha?.toFixed(2)}, β=${fit.beta?.toFixed(2)}, γ=${fit.gamma?.toFixed(2)}`:'ต้องมีข้อมูลอย่างน้อย 24 เดือน'};
  }
  if(id==='linear'){
    const fit=forecastLinearFit(values,horizon);return{forecast:fit.forecast,params:`R²=${fit.r2.toFixed(1)}%`};
  }
  return{forecast:forecastSma(values,horizon,3),params:'window=3'};
}
function forecastRollingCv(values=[],id='sma'){
  const v=forecastActiveSeries(values),minTrain=forecastModelMinHistory(id);
  if(v.length<=minTrain)return{id,label:forecastModelLabel(id),eligible:false,rmse:Infinity,mae:Infinity,smape:Infinity,mase:Infinity,wape:Infinity,bias:0,biasPct:0,trackingSignal:0,n:0,reason:`Auto-CV ต้องมีอย่างน้อย ${minTrain+1} เดือน`};
  const actual=[],pred=[];
  for(let i=minTrain;i<v.length;i++){
    const out=forecastModelRun(id,v.slice(0,i),1).forecast[0];
    if(Number.isFinite(out)){actual.push(v[i]);pred.push(out);}
  }
  if(!actual.length)return{id,label:forecastModelLabel(id),eligible:false,rmse:Infinity,mae:Infinity,smape:Infinity,mase:Infinity,wape:Infinity,bias:0,biasPct:0,trackingSignal:0,n:0,reason:'ข้อมูลไม่พอสำหรับ Cross-validation'};
  const bias=forecastBias(actual,pred);
  return{id,label:forecastModelLabel(id),eligible:true,rmse:forecastRmse(actual,pred),mae:forecastMae(actual,pred),smape:forecastSmape(actual,pred),mase:forecastMase(actual,pred,v),wape:forecastWape(actual,pred),bias:bias.mean,biasPct:bias.pct,trackingSignal:forecastTrackingSignal(actual,pred),n:actual.length,reason:''};
}
function buildStandardForecastModel(values=[],requested='auto',horizon=6){
  const active=forecastActiveSeries(values);
  const ids=['sma','ses','holt','hw','linear'];
  const candidates=ids.map(id=>forecastRollingCv(active,id));
  const eligible=candidates.filter(x=>x.eligible&&Number.isFinite(x.rmse)).sort((a,b)=>a.rmse-b.rmse);
  let selectedId=requested;
  let fallbackReason='';
  if(requested==='auto')selectedId=eligible[0]?.id||'sma';
  else{
    const fitEligible=active.length>=forecastModelMinHistory(requested);
    if(!fitEligible){selectedId=eligible[0]?.id||'sma';fallbackReason=`${forecastModelLabel(requested)} ต้องมีข้อมูลอย่างน้อย ${forecastModelMinHistory(requested)} เดือน จึงเปลี่ยนเป็น ${forecastModelLabel(selectedId)} อัตโนมัติ`;}
  }
  const run=forecastModelRun(selectedId,active,horizon);
  const cv=candidates.find(x=>x.id===selectedId)||{rmse:0,mae:0,smape:0,n:0};
  const future=(run.forecast||Array.from({length:horizon},()=>0)).map(v=>roundMoneyValue(Math.max(0,safeNum(v))));
  const rmse=Number.isFinite(cv.rmse)?cv.rmse:0;
  const intervals=future.map((value,index)=>{
    // 80% normal-approximation interval: lower=P10, center=P50, upper=P90.
    // RMSE from rolling-origin CV is used as an empirical one-step error scale.
    const margin=1.28*rmse*Math.sqrt(index+1);
    const p10=roundMoneyValue(Math.max(0,value-margin));
    const p50=roundMoneyValue(value);
    const p90=roundMoneyValue(value+margin);
    return{lower:p10,upper:p90,p10,p50,p90};
  });
  const dataScore=Math.min(100,active.length/24*100);
  const errorScore=Number.isFinite(cv.smape)?Math.max(0,100-cv.smape):35;
  const confidence=Math.round(Math.max(20,Math.min(95,errorScore*.7+dataScore*.3)));
  return{selectedId,label:forecastModelLabel(selectedId),params:run.params,future,forecast:future[0]||0,intervals,candidates,cv,historyCount:active.length,confidence,fallbackReason,requested};
}
function recentMeanVolatility(values){
  const vals=(values||[]).filter(v=>Number.isFinite(Number(v))).map(Number);
  if(vals.length<2)return 0;
  const mean=forecastMean(vals);if(!mean)return 0;
  const variance=vals.reduce((s,v)=>s+(v-mean)**2,0)/vals.length;
  return Math.sqrt(variance)/mean*100;
}
function buildSalesForecast(){
  const historyMonths=Math.max(6,parseInt(document.getElementById('forecast-history')?.value||12));
  const method=document.getElementById('forecast-method')?.value||'auto';
  const branches=dashBranches();
  const ref=forecastReferencePeriod(),refKey=forecastMonthKey(ref.year,ref.month);
  const history=[];
  for(let offset=historyMonths-1;offset>=0;offset--){
    const d=forecastMonthFromKey(refKey-offset);
    history.push({...d,value:forecastSalesForMonth(d.year,d.month,branches)});
  }
  const model=buildStandardForecastModel(history.map(x=>x.value),method,24);
  const future=model.future.map((value,index)=>{
    const d=forecastMonthFromKey(refKey+index+1),band=model.intervals[index]||{lower:value,upper:value};
    return{...d,value,lower:band.lower,upper:band.upper,p10:band.p10??band.lower,p50:band.p50??value,p90:band.p90??band.upper};
  });
  const next=future[0]?.value||0,current=history.at(-1)?.value||0;
  const nextRef=future[0]||forecastMonthFromKey(refKey+1);
  const pipeline=forecastQuotePipeline(nextRef.year,nextRef.month,branches);
  const yoy=forecastSalesForMonth(nextRef.year-1,nextRef.month,branches);
  const changeCurrent=current?((next-current)/current)*100:null;
  const changeYoy=yoy?((next-yoy)/yoy)*100:null;
  const recent=forecastActiveSeries(history.map(x=>x.value)).slice(-6);
  return{history,future,next,current,yoy,changeCurrent,changeYoy,confidence:model.confidence,volatility:recentMeanVolatility(recent),pipeline,ref,branches,model,scenarioNext:roundMoneyValue(next+pipeline.weighted)};
}
function forecastPercent(value){
  if(value===null||!Number.isFinite(value))return 'ยังเทียบไม่ได้';
  return `${value>=0?'+':''}${value.toFixed(1)}%`;
}
function forecastKpi(label,value,detail,cls=''){
  return `<div class="forecast-kpi ${cls}"><div class="fk-label">${label}</div><div class="fk-value">${value}</div><div class="fk-detail">${detail}</div></div>`;
}
function forecastAccuracyTableHtml(model){
  const rows=model.candidates||[];
  return `<div class="forecast-table-wrap"><table class="forecast-data-table forecast-governance-table"><thead><tr><th>โมเดล</th><th>สถานะ</th><th>ความคลาดเคลื่อน</th><th>WAPE / sMAPE</th><th>Bias / Tracking</th><th>MASE</th><th>Quant View</th><th>รอบทดสอบ</th></tr></thead><tbody>${rows.map(row=>{
    const selected=row.id===model.selectedId;
    const diag=forecastBiasDiagnostic(row);
    const biasText=row.eligible?`${row.biasPct>=0?'+':''}${row.biasPct.toFixed(1)}%`:'—';
    const biasDir=row.biasPct>0?'พยากรณ์ต่ำกว่าจริง':row.biasPct<0?'พยากรณ์สูงกว่าจริง':'สมดุล';
    return `<tr class="${selected?'is-model-selected':''}"><td><b>${escapeHtml(row.label)}</b>${selected?'<span class="model-selected-badge">เลือกใช้</span>':''}<small>${selected?escapeHtml(model.params||''):''}</small></td><td>${row.eligible?'<span class="status-pill good">พร้อมใช้</span>':`<span class="status-pill muted">${escapeHtml(row.reason)}</span>`}</td><td class="num"><b>${row.eligible?chartMoney(row.rmse):'—'}</b><small>MAE ${row.eligible?chartMoney(row.mae):'—'}</small></td><td class="num"><b>${row.eligible&&Number.isFinite(row.wape)?row.wape.toFixed(1)+'%':'—'}</b><small>sMAPE ${row.eligible?row.smape.toFixed(1)+'%':'—'}</small></td><td class="num"><b class="${Math.abs(safeNum(row.trackingSignal))>=4?'risk-text-danger':Math.abs(safeNum(row.biasPct))>=10?'risk-text-warn':'risk-text-good'}">${biasText}</b><small>${escapeHtml(biasDir)} · TS ${row.eligible?safeNum(row.trackingSignal).toFixed(2):'—'}</small></td><td class="num">${row.eligible&&Number.isFinite(row.mase)?row.mase.toFixed(2):'—'}</td><td><span class="quant-diagnostic-pill ${diag.cls}">${escapeHtml(diag.label)}</span><small>${escapeHtml(diag.detail)}</small></td><td class="num">${row.n||0}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function forecastDiagnosticSummaryHtml(model){
  const selected=model?.candidates?.find(row=>row.id===model.selectedId)||model?.cv||null;
  if(!selected||!selected.eligible)return '<div class="forecast-diagnostic-card muted"><b>Model Governance</b><span>ข้อมูลย้อนหลังยังไม่พอสำหรับตรวจ Bias และ Tracking Signal</span></div>';
  const diag=forecastBiasDiagnostic(selected);
  const wape=safeNum(selected.wape),ts=safeNum(selected.trackingSignal),bias=safeNum(selected.biasPct);
  const accuracyLabel=wape<=15?'แม่นยำสูง':wape<=25?'ใช้งานได้ดี':wape<=40?'ปานกลาง':'ความคลาดเคลื่อนสูง';
  return `<div class="forecast-diagnostic-grid"><div class="forecast-diagnostic-card"><small>Forecast Accuracy</small><b>${wape.toFixed(1)}% WAPE</b><span>${accuracyLabel} · MASE ${Number.isFinite(selected.mase)?selected.mase.toFixed(2):'—'}</span></div><div class="forecast-diagnostic-card ${diag.cls}"><small>Bias Check</small><b>${bias>=0?'+':''}${bias.toFixed(1)}%</b><span>${bias>0?'โมเดลมีแนวโน้มพยากรณ์ต่ำกว่ายอดจริง':bias<0?'โมเดลมีแนวโน้มพยากรณ์สูงกว่ายอดจริง':'Bias ใกล้ศูนย์'}</span></div><div class="forecast-diagnostic-card ${Math.abs(ts)>=4?'danger':'good'}"><small>Tracking Signal</small><b>${ts.toFixed(2)}</b><span>${Math.abs(ts)>=4?'เกินกรอบเฝ้าระวัง ±4 ควรตรวจโมเดล':'อยู่ในกรอบเฝ้าระวัง ±4'}</span></div><div class="forecast-diagnostic-card"><small>Model Governance</small><b>${escapeHtml(model.label)}</b><span>${escapeHtml(diag.label)} · ทดสอบย้อนหลัง ${selected.n||0} รอบ</span></div></div>`;
}
function forecastFutureTableHtml(f){
  const rows=f.future.slice(0,6);
  return `<div class="forecast-table-wrap"><table class="forecast-data-table"><thead><tr><th>เดือน</th><th>P10</th><th>P50 / Base</th><th>P90</th></tr></thead><tbody>${rows.map(row=>`<tr><td><b>${escapeHtml(forecastMonthLabel(row.year,row.month))}</b></td><td class="num">${chartMoney(row.p10??row.lower)}</td><td class="num"><b>${chartMoney(row.p50??row.value)}</b></td><td class="num">${chartMoney(row.p90??row.upper)}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderSalesForecast(){
  const host=document.getElementById('forecast-metrics');if(!host)return;
  const f=buildSalesForecast(),trendClass=(f.changeCurrent??0)>=0?'positive':'negative';
  const banner=document.getElementById('forecast-model-banner');
  if(banner)banner.innerHTML=`<div><span class="forecast-model-dot"></span><b>${escapeHtml(f.model.label)}</b><span>${escapeHtml(f.model.params||'')}</span></div><div>CV RMSE ${Number.isFinite(f.model.cv.rmse)?chartMoney(f.model.cv.rmse):'—'} · sMAPE ${Number.isFinite(f.model.cv.smape)?f.model.cv.smape.toFixed(1)+'%':'—'} · ข้อมูลจริง ${f.model.historyCount} เดือน</div>${f.model.fallbackReason?`<small>${escapeHtml(f.model.fallbackReason)}</small>`:''}`;
  const nextRef=f.future[0]||forecastMonthFromKey(forecastMonthKey(f.ref.year,f.ref.month)+1);
  host.innerHTML=
    forecastKpi('Base Forecast เดือนถัดไป',chartMoney(f.next),`${forecastMonthLabel(nextRef.year,nextRef.month)} · คะแนนความน่าเชื่อถือ ${f.confidence}%`,trendClass)+
    forecastKpi('เทียบเดือนล่าสุด',forecastPercent(f.changeCurrent),`ยอดล่าสุด ${chartMoney(f.current)}`,trendClass)+
    forecastKpi('เทียบเดือนเดียวกันปีก่อน',forecastPercent(f.changeYoy),f.yoy?`ปีก่อน ${chartMoney(f.yoy)}`:'ยังไม่มีข้อมูลปีก่อน',(f.changeYoy??0)>=0?'positive':'negative')+
    forecastKpi('Upside Scenario จาก Pipeline',chartMoney(f.scenarioNext),`${f.pipeline.count} ใบเสนอราคารออนุมัติ · Approval proxy ${(f.pipeline.probability*100).toFixed(1)}%`,'pipeline');

  const chartRows=[...f.history.slice(-6).map(x=>({...x,future:false})),...f.future.slice(0,6).map(x=>({...x,future:true}))];
  const max=Math.max(...chartRows.map(x=>safeNum(x.value)),1);
  const chart=document.getElementById('forecast-chart');
  if(chart)chart.innerHTML=chartRows.map(x=>`<div class="forecast-row">
    <div class="forecast-label">${MONTHS[x.month].slice(0,3)} ${String(yearLabelBE(x.year)).slice(-2)}${x.future?' *':''}</div>
    <div class="forecast-track"><div class="forecast-fill ${x.future?'future':''}" style="width:${Math.max(2,x.value/max*100)}%"></div></div>
    <div class="forecast-value">${chartMoney(x.value)}</div>
  </div>`).join('');
  const note=document.getElementById('forecast-note');
  if(note)note.innerHTML=`ยอดจริง = แถบทึบ · Base Forecast = แถบลาย · ใช้ข้อมูลถึง ${forecastMonthLabel(f.ref.year,f.ref.month)} · ช่วงต่ำ/สูงเป็นช่วงประมาณ 80% จาก Cross-validation RMSE และไม่ใช่การรับประกันยอดขาย`;
  const futureTable=document.getElementById('forecast-future-table');if(futureTable)futureTable.innerHTML=forecastFutureTableHtml(f);
  const accuracy=document.getElementById('forecast-accuracy-table');if(accuracy)accuracy.innerHTML=forecastAccuracyTableHtml(f.model);
  const diagSummary=document.getElementById('forecast-diagnostic-summary');if(diagSummary)diagSummary.innerHTML=forecastDiagnosticSummaryHtml(f.model);
  const methodNote=document.getElementById('forecast-method-note');if(methodNote)methodNote.innerHTML=`Auto จะเลือกโมเดลที่มี <b>RMSE ต่ำสุดจาก Rolling-origin Cross-validation</b> ในข้อมูลชุดนี้ · Holt-Winters ใช้ได้เมื่อมีข้อมูลอย่างน้อย 24 เดือน (Auto-CV ต้องมีอย่างน้อย 25 เดือน) · Pipeline ใช้ Historical Approval Proxy ${(f.pipeline.probability*100).toFixed(1)}% (${f.pipeline.history?.source==='history'?'ข้อมูลย้อนหลัง':'fallback'}) แยกจาก Base Forecast`;

  const nextYear=f.ref.year+1,annualRows=f.future.filter(x=>x.year===nextYear),annualTotal=annualRows.reduce((s,x)=>s+x.value,0);
  const currentYearTotal=Array.from({length:12},(_,m)=>forecastSalesForMonth(f.ref.year,m,f.branches)).reduce((a,b)=>a+b,0);
  const annualGrowth=currentYearTotal?((annualTotal-currentYearTotal)/currentYearTotal)*100:null;
  const best=f.future.slice(0,12).sort((a,b)=>b.value-a.value)[0],low=f.future.slice(0,12).sort((a,b)=>a.value-b.value)[0];
  const yearSummary=document.getElementById('forecast-year-summary');
  if(yearSummary)yearSummary.innerHTML=`
    <div class="forecast-year-total">${chartMoney(annualTotal)}</div>
    <div class="forecast-year-caption">ยอดขายรวมที่คาดการณ์สำหรับปี พ.ศ. ${yearLabelDual(nextYear)}${annualRows.length<12?' (เฉพาะเดือนที่อยู่ใน Forecast Horizon)':''}</div>
    <div class="forecast-year-grid">
      <div class="forecast-mini"><span>เติบโตเทียบปีที่เลือก</span><b>${forecastPercent(annualGrowth)}</b></div>
      <div class="forecast-mini"><span>เดือนคาดการณ์สูงสุด</span><b>${best?MONTHS[best.month]:'-'}</b></div>
      <div class="forecast-mini"><span>เดือนคาดการณ์ต่ำสุด</span><b>${low?MONTHS[low.month]:'-'}</b></div>
      <div class="forecast-mini"><span>ความผันผวน 6 เดือน</span><b>${f.volatility.toFixed(1)}%</b></div>
    </div>`;

  const alerts=[];
  if(f.model.historyCount<6)alerts.push({cls:'danger',text:'ข้อมูลย้อนหลังยังน้อยกว่า 6 เดือน ผลพยากรณ์ควรใช้เพื่อดูทิศทางเบื้องต้นเท่านั้น'});
  if(f.model.selectedId==='hw')alerts.push({cls:'good',text:'ระบบตรวจพบข้อมูลเพียงพอสำหรับฤดูกาลรายปี และเลือก Holt-Winters ซึ่งรองรับ Trend + Seasonality'});
  if((f.changeCurrent??0)<-10)alerts.push({cls:'danger',text:`Base Forecast เดือนถัดไปลดลง ${Math.abs(f.changeCurrent).toFixed(1)}% จากเดือนล่าสุด ควรตรวจ Pipeline และลูกค้ารายใหญ่`});
  else if((f.changeCurrent??0)>10)alerts.push({cls:'good',text:`Base Forecast เดือนถัดไปเพิ่มขึ้น ${f.changeCurrent.toFixed(1)}% ควรเตรียมกำลังผลิต สต็อก และกระแสเงินสด`});
  else alerts.push({cls:'',text:'แนวโน้มเดือนถัดไปค่อนข้างทรงตัวเมื่อเทียบเดือนล่าสุด'});
  if(f.pipeline.count>0)alerts.push({cls:'warn',text:`มี Pipeline ${f.pipeline.count} รายการ มูลค่า ${chartMoney(f.pipeline.total)}; Historical Approval Proxy ${(f.pipeline.probability*100).toFixed(1)}% ให้ Expected Pipeline ${chartMoney(f.pipeline.weighted)} และ Upside Scenario ${chartMoney(f.scenarioNext)}`});
  if(f.volatility>35)alerts.push({cls:'warn',text:'ยอดขายย้อนหลังผันผวนสูง ควรพิจารณาช่วงคาดการณ์ต่ำ–สูงควบคู่กับค่ากลาง'});
  const alertsEl=document.getElementById('forecast-alerts');if(alertsEl)alertsEl.innerHTML=alerts.map(a=>`<div class="forecast-alert ${a.cls}">${a.text}</div>`).join('');
}

// ============================================================
// PRODUCTION VS DELIVERY — ยอดสั่งผลิตเทียบยอดส่งสินค้า
// ============================================================
function productionNetSales(doc={}){
  return invoiceNetSales(doc);
}
function selectedDashboardMonths(){
  const selectedMonth=parseInt(document.getElementById('dash-month')?.value??-1,10);
  return selectedMonth>=0?[selectedMonth]:Array.from({length:12},(_,i)=>i);
}
function productionHasInvoice(prod,invoices=[]){
  if(prod?.invoiceStatus==='created'||prod?.invoiceNo||prod?.invoiceId)return true;
  const prodId=prod?.id!==undefined&&prod?.id!==null?String(prod.id):'';
  const prodNo=String(prod?.no||'');
  return invoices.some(inv=>{
    if(prodId&&String(inv.sourceProductionId||'')===prodId)return true;
    return prodNo&&String(inv.sourceProductionNo||'')===prodNo;
  });
}
function buildProductionDeliveryComparison(){
  const year=parseInt(document.getElementById('dash-year')?.value||now.getFullYear(),10);
  const months=selectedDashboardMonths();
  const branches=dashBranches();
  const rows=[];
  const pending=[];
  let productionTotal=0,deliveryTotal=0,productionCount=0,linkedCount=0,linkedValue=0;

  months.forEach(month=>{
    let monthProduction=0,monthDelivery=0;
    const mirrorMonth=shouldMirrorHistoricalSalesAsDelivery(year,month);
    branches.forEach(branch=>{
      const store=loadFor(branch,year,month);
      const productions=dedupeRecords(store.productions||[]);
      const invoices=dedupeRecords(store.invoices||[]);
      if(!mirrorMonth)monthDelivery+=invoices.reduce((sum,inv)=>sum+invoiceNetSales(inv),0);
      productions.forEach(prod=>{
        const value=productionNetSales(prod);
        const linked=mirrorMonth || productionHasInvoice(prod,invoices);
        monthProduction+=value;
        productionCount+=1;
        if(linked){linkedCount+=1;linkedValue+=value;}
        else if(!prod.historicalSalesImport) pending.push({...prod,branch,_year:year,_month:month,_netSales:value});
      });
      if(mirrorMonth)monthDelivery+=productions.reduce((sum,prod)=>sum+productionNetSales(prod),0);
    });
    productionTotal+=monthProduction;
    deliveryTotal+=monthDelivery;
    rows.push({month,production:monthProduction,delivery:monthDelivery,mirrored:mirrorMonth});
  });

  const gap=productionTotal-deliveryTotal;
  const deliveryRate=productionTotal>0?deliveryTotal/productionTotal*100:0;
  const linkRate=productionCount>0?linkedCount/productionCount*100:0;
  const pendingValue=pending.reduce((sum,p)=>sum+p._netSales,0);
  pending.sort((a,b)=>b._netSales-a._netSales);
  return{year,months,branches,rows,productionTotal,deliveryTotal,gap,deliveryRate,productionCount,linkedCount,linkRate,linkedValue,pending,pendingValue};
}
function flowMetric(label,value,detail,cls=''){
  return `<div class="flow-kpi ${cls}"><div class="flow-kpi-label">${label}</div><div class="flow-kpi-value">${value}</div><div class="flow-kpi-detail">${detail}</div></div>`;
}
function renderProductionDeliveryComparison(){
  const metrics=document.getElementById('flow-metrics');
  if(!metrics)return;
  const d=buildProductionDeliveryComparison();
  const period=d.months.length===1?`${MONTHS[d.months[0]]} พ.ศ. ${yearLabelDual(d.year)}`:`ปี พ.ศ. ${yearLabelDual(d.year)}`;
  const branchLabel=d.branches.length===2?'รวมทุกสาขา':(BRANCH_TH[d.branches[0]]||'');
  document.getElementById('flow-period-label').textContent=`${period} · ${branchLabel}`;

  const gapClass=d.gap>0?'warning':d.gap<0?'positive':'';
  const gapDetail=d.gap>0?'มูลค่าสั่งผลิตที่ยังมากกว่ายอดส่งสินค้า':d.gap<0?'ยอดส่งสินค้าสูงกว่ายอดสั่งผลิตในช่วงที่เลือก':'ยอดทั้งสองส่วนสมดุลกัน';
  metrics.innerHTML=
    flowMetric('ยอดสั่งผลิตที่ขาย',chartMoney(d.productionTotal),`${d.productionCount} ใบสั่งผลิต`,'production')+
    flowMetric('ยอดส่งสินค้า',chartMoney(d.deliveryTotal),d.rows.some(r=>r.mirrored)?'ม.ค.–มิ.ย. 2569 ใช้ยอดขายย้อนหลังเป็นยอดส่งสินค้า':'ยอดขายก่อน VAT จากใบส่งสินค้า / ใบกำกับภาษี','delivery')+
    flowMetric('ส่วนต่างคงเหลือ',chartMoney(Math.abs(d.gap)),gapDetail,gapClass)+
    flowMetric('อัตราส่งสินค้าเทียบสั่งผลิต',`${d.deliveryRate.toFixed(1)}%`,`เชื่อมบิลแล้ว ${d.linkedCount}/${d.productionCount} ใบ`,'rate');

  const visibleRows=d.months.length===1?d.rows:d.rows;
  const max=Math.max(...visibleRows.flatMap(r=>[r.production,r.delivery]),1);
  document.getElementById('flow-chart').innerHTML=visibleRows.map(r=>`<div class="flow-row">
    <div class="flow-month">${MONTHS[r.month].slice(0,3)}</div>
    <div class="flow-bars">
      <div class="flow-bar-line"><span class="flow-bar production" style="width:${Math.max(r.production?2:0,r.production/max*100)}%"></span><b>${chartMoney(r.production)}</b></div>
      <div class="flow-bar-line"><span class="flow-bar delivery" style="width:${Math.max(r.delivery?2:0,r.delivery/max*100)}%"></span><b>${chartMoney(r.delivery)}</b></div>
    </div>
  </div>`).join('');
  document.getElementById('flow-chart-note').textContent='เดือน ม.ค.–มิ.ย. 2569 ระบบให้ยอดส่งสินค้าเท่ากับยอดขาย/สั่งผลิตย้อนหลัง ส่วนเดือนอื่นใช้ยอดก่อน VAT จากใบส่งสินค้า / ใบกำกับภาษี';

  const rate=Math.max(0,Math.min(100,d.linkRate));
  document.getElementById('flow-conversion').innerHTML=`
    <div class="flow-conversion-head"><span>อัตราออกบิลจากใบสั่งผลิต</span><b>${d.linkRate.toFixed(1)}%</b></div>
    <div class="flow-progress"><span style="width:${rate}%"></span></div>
    <div class="flow-conversion-grid">
      <div><span>ออกบิลแล้ว</span><b>${d.linkedCount} รายการ</b></div>
      <div><span>ยังไม่ออกบิล</span><b>${d.pending.length} รายการ</b></div>
      <div><span>มูลค่าที่เชื่อมบิลแล้ว</span><b>${chartMoney(d.linkedValue)}</b></div>
      <div><span>มูลค่ารอออกบิล</span><b>${chartMoney(d.pendingValue)}</b></div>
    </div>`;

  document.getElementById('flow-pending-list').innerHTML=d.pending.length?d.pending.slice(0,6).map(p=>`
    <div class="flow-pending-row">
      <div><b>${escapeHtml(p.no||'-')}</b><span>${escapeHtml(p.customer||p.job||'ไม่ระบุลูกค้า')} · ${MONTHS[p._month]}</span></div>
      <strong>${chartMoney(p._netSales)}</strong>
    </div>`).join(''):`<div class="empty" style="padding:1rem">ไม่มีใบสั่งผลิตที่รอออกบิลในช่วงที่เลือก</div>`;
}

// ============================================================
// DASHBOARD CHARTS — กราฟแท่งรายเดือน/รายปี + ลูกค้า Top 10
// ============================================================
function dashBranches(){return dashTab==='all'?tenantActiveBranchIds():[dashTab];}
function safeNum(n){return Number.isFinite(Number(n))?Number(n):0;}
function chartMoney(n){return '฿'+fmt(Math.round(safeNum(n)*100)/100);}
function chartCount(n){return fmt(safeNum(n))+' รายการ';}
function dashMetricLabel(metric){return{sales:'ยอดขายก่อน VAT จากใบสั่งผลิต/ฐานข้อมูลยอดขาย',delivery:'ยอดส่งสินค้า',production:'ยอดสั่งผลิตสินค้า',profit:'กำไรสุทธิ',expense:'ค่าใช้จ่าย'}[metric]||metric;}
function dashMetricClass(metric){return{sales:'',delivery:'purple',production:'purple',profit:'green',expense:'red'}[metric]||'';}
function metricFromData(d,metric,year,month){
  const expenses=d.expenses||[];
  const productions=dedupeRecords(d.productions||[]);
  const invoices=dedupeRecords(d.invoices||[]);
  if(metric==='sales')return productions.reduce((s,x)=>s+productionNetSalesValue(x),0);
  if(metric==='delivery')return shouldMirrorHistoricalSalesAsDelivery(year,month)
    ? productions.reduce((s,x)=>s+productionNetSalesValue(x),0)
    : invoices.reduce((s,x)=>s+invoiceNetSales(x),0);
  if(metric==='production')return productions.reduce((s,x)=>s+productionNetSalesValue(x),0);
  if(metric==='expense')return expenses.reduce((s,x)=>s+safeNum(x.amount),0);
  if(metric==='profit'){
    const productionProfit=productions.reduce((s,x)=>{
      if(Number.isFinite(Number(x.profit)))return s+safeNum(x.profit);
      return s+productionNetSalesValue(x)-safeNum(x.costTotal??x.costSubtotal)-safeNum(x.commAmt);
    },0);
    const exp=expenses.reduce((s,x)=>s+safeNum(x.amount),0);
    return productionProfit-exp;
  }
  return 0;
}
function rowsForMonthlyChart(year,branches,metric){
  return MONTHS.map((name,m)=>{
    let value=0;
    branches.forEach(br=>{value+=metricFromData(loadFor(br,year,m),metric,year,m);});
    return{label:name,value,sub:`${name} พ.ศ. ${yearLabelDual(year)}`};
  });
}
function rowsForYearlyChart(branches,metric){
  const years=allYears().slice().sort((a,b)=>a-b);
  return years.map(year=>{
    let value=0;
    branches.forEach(br=>{for(let m=0;m<12;m++)value+=metricFromData(loadFor(br,year,m),metric,year,m);});
    return{label:String(year+543),value,sub:`ปี พ.ศ. ${yearLabelDual(year)}`};
  });
}
function renderBarRows(containerId,rows,opt={}){
  const el=document.getElementById(containerId);if(!el)return;
  const filtered=rows.filter(r=>safeNum(r.value)>0);
  if(!filtered.length){el.innerHTML='<div class="chart-empty">ยังไม่มีข้อมูลสำหรับแสดงกราฟ</div>';return;}
  const max=Math.max(...filtered.map(r=>Math.abs(safeNum(r.value))),1);
  const cls=opt.fillClass||'';
  el.innerHTML=filtered.map(r=>{
    const v=safeNum(r.value),w=Math.max(2,Math.round(Math.abs(v)/max*100));
    const valText=opt.mode==='count'?chartCount(v):chartMoney(v);
    return `<div class="chart-bar-row" title="${r.sub||r.label}">
      <div><div class="chart-label">${r.label}</div>${r.sub?`<div class="chart-note">${r.sub}</div>`:''}</div>
      <div class="chart-track"><div class="chart-fill ${cls}" style="width:${w}%"></div></div>
      <div class="chart-value">${valText}</div>
    </div>`;
  }).join('');
}
function renderMainDashChart(){
  const year=parseInt(document.getElementById('dash-year')?.value||now.getFullYear());
  const metric=document.getElementById('dash-chart-metric')?.value||'sales';
  const range=document.getElementById('dash-chart-range')?.value||'monthly';
  const branches=dashBranches();
  const rows=range==='yearly'?rowsForYearlyChart(branches,metric):rowsForMonthlyChart(year,branches,metric);
  renderBarRows('dash-bar-chart',rows,{fillClass:dashMetricClass(metric)});
  const total=rows.reduce((s,r)=>s+safeNum(r.value),0);
  const best=rows.slice().sort((a,b)=>safeNum(b.value)-safeNum(a.value))[0];
  const branchLabel=dashTab==='all'?'รวมทั้ง 2 สาขา':BRANCH_TH[dashTab];
  const summary=document.getElementById('dash-bar-summary');
  if(summary)summary.innerHTML=`<b>${dashMetricLabel(metric)}</b> — ${branchLabel}<br>รวมทั้งหมด ${chartMoney(total)}${best&&best.value>0?` · สูงสุด: ${best.label} (${chartMoney(best.value)})`:''}`;
}
function customerRows(year,monthVal,branches,source,mode){
  const months=monthVal===-1?Array.from({length:12},(_,i)=>i):[monthVal];
  const map=new Map();
  const add=(name,value,kind)=>{
    const key=(name||'ไม่ระบุลูกค้า').trim()||'ไม่ระบุลูกค้า';
    const cur=map.get(key)||{label:key,value:0,count:0,invoiceValue:0,productionValue:0};
    const val=safeNum(value);
    cur.value+=val;cur.count+=1;
    if(kind==='invoice')cur.invoiceValue+=val;
    if(kind==='production')cur.productionValue+=val;
    map.set(key,cur);
  };
  branches.forEach(br=>months.forEach(m=>{
    const d=loadFor(br,year,m);
    const productions=dedupeRecords(d.productions||[]);
    if(source==='all'||source==='invoices'){
      if(shouldMirrorHistoricalSalesAsDelivery(year,m))productions.forEach(x=>add(x.customer,productionNetSalesValue(x),'invoice'));
      else (d.invoices||[]).forEach(x=>add(x.customer,invoiceNetSales(x),'invoice'));
    }
    if(source==='all'||source==='productions'){
      productions.forEach(x=>add(x.customer,productionNetSalesValue(x),'production'));
    }
  }));
  return Array.from(map.values()).map(x=>({
    ...x,
    chartValue:mode==='count'?x.count:x.value,
    sub:`บิล ฿${fmt(x.invoiceValue)} · สั่งผลิต ฿${fmt(x.productionValue)} · ${x.count} เอกสาร`
  })).sort((a,b)=>safeNum(b.chartValue)-safeNum(a.chartValue)).slice(0,10).map(x=>({label:x.label,value:x.chartValue,sub:x.sub}));
}
function renderCustomerChart(){
  const year=parseInt(document.getElementById('dash-year')?.value||now.getFullYear());
  const mVal=parseInt(document.getElementById('dash-month')?.value??-1);
  const source=document.getElementById('dash-customer-source')?.value||'all';
  const mode=document.getElementById('dash-customer-mode')?.value||'value';
  const rows=customerRows(year,mVal,dashBranches(),source,mode);
  renderBarRows('dash-customer-chart',rows,{fillClass:'green',mode});
  const total=rows.reduce((s,r)=>s+safeNum(r.value),0);
  const srcLabel={all:'ใบส่งสินค้า / ใบกำกับภาษี + ใบสั่งผลิต',invoices:'ใบส่งสินค้า / ใบกำกับภาษี',productions:'ใบสั่งผลิต'}[source];
  const monthText=mVal===-1?'ทั้งปี':MONTHS[mVal];
  const summary=document.getElementById('dash-customer-summary');
  if(summary)summary.innerHTML=`แสดงลูกค้า Top 10 จาก <b>${srcLabel}</b> ช่วง ${monthText} พ.ศ. ${yearLabelDual(year)}<br>${mode==='count'?'จำนวนเอกสารรวม':'มูลค่ารวมในกราฟ'}: <b>${mode==='count'?chartCount(total):chartMoney(total)}</b>`;
}
function dashboardAgencyRows(year,monthVal,branches){
  const months=monthVal===-1?Array.from({length:12},(_,i)=>i):[monthVal];
  const map=new Map();
  const add=(record,value)=>{
    const agency=customerAgencyForRecord(record||{});
    const key=agency.customerAgencyGroup||'other';
    const cur=map.get(key)||{label:agency.customerAgencyGroupLabel||agencyGroupLabel(key),value:0,count:0,customers:new Set()};
    cur.value+=safeNum(value);cur.count+=1;cur.customers.add(analyticsCustomer(record));map.set(key,cur);
  };
  branches.forEach(br=>months.forEach(m=>{
    const d=loadFor(br,year,m);
    const productions=dedupeRecords(d.productions||[]);
    productions.forEach(row=>add(row,productionNetSalesValue(row)));
    if(!shouldMirrorHistoricalSalesAsDelivery(year,m))(d.invoices||[]).forEach(row=>add(row,invoiceNetSales(row)));
  }));
  return Array.from(map.values()).map(row=>({label:row.label,value:row.value,sub:`ลูกค้า ${[...row.customers].filter(x=>x&&x!=='ไม่ระบุลูกค้า').length} ราย · เอกสาร ${row.count}`})).sort((a,b)=>safeNum(b.value)-safeNum(a.value));
}
function renderDashboardAgencyChart(){
  const year=parseInt(document.getElementById('dash-year')?.value||now.getFullYear());
  const mVal=parseInt(document.getElementById('dash-month')?.value??-1);
  const rows=dashboardAgencyRows(year,mVal,dashBranches());
  renderBarRows('dash-agency-chart',rows,{fillClass:'blue'});
  const total=rows.reduce((s,r)=>s+safeNum(r.value),0);
  const top=rows[0];
  const summary=document.getElementById('dash-agency-summary');
  const monthText=mVal===-1?'ทั้งปี':MONTHS[mVal];
  if(summary)summary.innerHTML=rows.length?`ช่วง ${monthText} พ.ศ. ${yearLabelDual(year)} ยอดรวมตามกลุ่มลูกค้า <b>${chartMoney(total)}</b> · กลุ่มสูงสุดคือ <b>${escapeHtml(top.label)}</b> ${chartMoney(top.value)}`:'ยังไม่มีข้อมูลกลุ่มลูกค้าในช่วงที่เลือก';
}
function renderDashCharts(){
  renderMainDashChart();
  renderCustomerChart();
  renderDashboardAgencyChart();
}

// ============================================================
// BUSINESS ANALYTICS — business overview, customer intelligence, forecast, action plan
// ============================================================
function analyticsFilters(){
  const yearEl=document.getElementById('analytics-year');
  const monthEl=document.getElementById('analytics-month');
  if(yearEl && !yearEl.options.length)populateYearSel('analytics-year',allYears());
  if(monthEl && monthEl.options.length<=1)populateMonthSel('analytics-month',false);
  const year=Number(yearEl?.value||now.getFullYear());
  const rawMonth=monthEl?.value??'';
  return{
    branch:document.getElementById('analytics-branch')?.value||'',
    year:Number.isFinite(year)?year:now.getFullYear(),
    month:rawMonth===''?'':Number(rawMonth),
    focus:document.getElementById('analytics-focus')?.value||'sales',
    agencyGroup:document.getElementById('analytics-agency-group')?.value||'',
    agencyType:document.getElementById('analytics-agency-type')?.value||'',
    product:document.getElementById('analytics-product')?.value||'',
    forecastMethod:document.getElementById('analytics-forecast-method')?.value||'auto'
  };
}
function analyticsBranchList(branch){return branch?[branch]:tenantActiveBranchIds();}
function analyticsMonthList(month){return month===''?Array.from({length:12},(_,i)=>i):[Number(month)];}
function normalizeAnalyticsDoc(row,meta){const enriched=withCustomerAgencyMeta(row||{});return{...enriched,branch:row?.branch||meta.branch,_year:meta.year,_month:meta.month,_type:meta.type};}
function collectAnalyticsData(filter=analyticsFilters()){
  const out={quotes:[],productions:[],invoices:[],receipts:[],issuedInvoices:[],issuedReceipts:[],expenses:[]};
  analyticsBranchList(filter.branch).forEach(branch=>analyticsMonthList(filter.month).forEach(month=>{
    const data=loadFor(branch,filter.year,month);
    Object.keys(out).forEach(type=>{
      const rows=type==='quotes'||type==='invoices'||type==='receipts'||type==='issuedInvoices'||type==='issuedReceipts'||type==='productions'
        ?dedupeRecords(data[type]||[])
        :(data[type]||[]);
      rows.forEach(row=>{
        if((filter.agencyGroup||filter.agencyType)&&type==='expenses')return;
        const enriched=normalizeAnalyticsDoc(row,{branch,year:filter.year,month,type});
        if(filter.agencyGroup&&enriched.customerAgencyGroup!==filter.agencyGroup)return;
        if(filter.agencyType&&enriched.customerAgencyType!==filter.agencyType)return;
        out[type].push(enriched);
      });
    });
  }));
  return out;
}
function analyticsPrimarySalesRows(data){return data.productions.length?data.productions:data.invoices;}
function analyticsSalesValue(row){
  if(row?._type==='invoices'||row?._type==='receipts'||row?._type==='issuedInvoices'||row?._type==='issuedReceipts')return invoiceNetSales(row);
  if(row?._type==='quotes')return safeNum(row.subtotal||row.saleTotal||row.total);
  return productionNetSalesValue(row);
}
function analyticsCostValue(row){return safeNum(row.costTotal??row.costSubtotal??row.costGrandTotal);}
function analyticsCommissionValue(row){return safeNum(row.commAmt??row.commission??row.commissionAmount);}
function analyticsProfitValue(row){
  if(Number.isFinite(Number(row.profit)))return safeNum(row.profit);
  return analyticsSalesValue(row)-analyticsCostValue(row)-analyticsCommissionValue(row);
}
function analyticsDocNo(row){return String(row?.no||row?.docNo||row?.invoiceNo||row?.receiptNo||row?.productionNo||row?.id||'').trim();}
function analyticsHasMissingText(value){return !String(value||'').trim();}
function analyticsSalesperson(row={}){return String(row.salesperson||row.salesPerson||row.salePerson||row.sales||row.employee||row.staff||row.createdByEmail||'ไม่ระบุพนักงานขาย').trim()||'ไม่ระบุพนักงานขาย';}
function analyticsCustomer(row={}){return String(row.customer||row.customerName||row.client||'ไม่ระบุลูกค้า').trim()||'ไม่ระบุลูกค้า';}
function analyticsDateObj(row={}){return parseFlexibleBusinessDate(row.date)||parseFlexibleBusinessDate(row.displayDate)||new Date(toCEYear(row._year||now.getFullYear()),Number(row._month||0),1);}
function analyticsDateLabel(row={}){return formatThaiDate(row.date||row.displayDate)||'-';}
function analyticsItemRows(rows){
  const result=[];
  rows.forEach(row=>{
    const items=Array.isArray(row.items)&&row.items.length?row.items:[{product:row.product||row.job||row.customer||'ไม่ระบุสินค้า',qty:row.qty||0,unit:row.unit||'',saleTotal:analyticsSalesValue(row)}];
    const rowTotal=analyticsSalesValue(row);
    const explicitTotal=items.reduce((s,it)=>s+safeNum(it.saleTotal||it.total||(safeNum(it.qty)*safeNum(it.priceUnit||it.saleValue||it.price))),0);
    items.forEach((it,index)=>{
      const value=safeNum(it.saleTotal||it.total||(safeNum(it.qty)*safeNum(it.priceUnit||it.saleValue||it.price)));
      const inferred=explicitTotal>0?value:(items.length===1?rowTotal:rowTotal/items.length);
      const productName=String(it.product||it.name||row.job||'ไม่ระบุสินค้า').trim()||'ไม่ระบุสินค้า';
      const productMeta=productMasterMeta(productName,it.productCode||it.code||'',it.productCategory||it.category||'');
      result.push({
        product:productName,productCode:productMeta.productCode,productCategory:productMeta.productCategory,
        qty:safeNum(it.qty),unit:it.unit||row.unit||'',value:roundMoneyValue(inferred),
        branch:row.branch,customer:analyticsCustomer(row),salesperson:analyticsSalesperson(row),source:row._type,
        ...customerAgencyForRecord(row),
        date:row.date,_year:row._year,_month:row._month
      });
    });
  });
  return result;
}
function sumBy(rows,fn){return rows.reduce((sum,row)=>sum+safeNum(fn(row)),0);}
function percentText(value){return `${roundMoneyValue(safeNum(value))}%`;}
function ratioPercent(numerator,denominator){return denominator>0?numerator/denominator*100:0;}
function analyticsKpi(label,value,detail,cls=''){
  return `<div class="analytics-kpi ${cls}"><small>${label}</small><b>${value}</b><span>${detail||''}</span></div>`;
}
function groupAnalytics(rows,keyFn,valueFn){
  const map=new Map();
  rows.forEach(row=>{
    const key=String(keyFn(row)||'ไม่ระบุ').trim()||'ไม่ระบุ';
    const cur=map.get(key)||{label:key,value:0,count:0,rows:[]};
    cur.value+=safeNum(valueFn(row));cur.count+=1;cur.rows.push(row);map.set(key,cur);
  });
  return Array.from(map.values()).sort((a,b)=>safeNum(b.value)-safeNum(a.value));
}
function calculateAbcRows(groupedRows){
  const total=groupedRows.reduce((s,r)=>s+safeNum(r.value),0);
  let cum=0;
  return groupedRows.map(row=>{
    cum+=safeNum(row.value);
    const contribution=total>0?safeNum(row.value)/total*100:0;
    const pct=total>0?cum/total*100:0;
    const abc=pct<=80?'A':pct<=95?'B':'C';
    return{...row,contributionPercent:contribution,cumulativePercent:pct,abc};
  });
}
function analyticsSortDateDesc(a,b){return analyticsDateObj(b)-analyticsDateObj(a);}
function buildAnalyticsQuality(data){
  const businessTypes=['quotes','productions','invoices','receipts','issuedInvoices','issuedReceipts'];
  const docs=businessTypes.flatMap(type=>(data[type]||[]).map(row=>({...row,_type:type})));
  const seen=new Set();let duplicates=0;
  const samples=[];
  const addSample=(type,row,reason)=>{if(samples.length<12)samples.push({type,docNo:analyticsDocNo(row)||'-',customer:analyticsCustomer(row),date:analyticsDateLabel(row),reason,branch:row?.branch||''});};
  docs.forEach(row=>{
    const key=[row._type,row.branch,analyticsDocNo(row)].join('|').toLowerCase();
    if(analyticsDocNo(row)&&seen.has(key)){duplicates+=1;addSample(row._type,row,'เลขเอกสารซ้ำ');}
    else if(analyticsDocNo(row))seen.add(key);
  });
  const missingDateRows=docs.filter(row=>analyticsHasMissingText(row.date));
  const missingCustomerRows=docs.filter(row=>analyticsHasMissingText(row.customer)&&!['issuedInvoices','issuedReceipts'].includes(row._type));
  const zeroAmountRows=docs.filter(row=>analyticsSalesValue(row)<=0&&row._type!=='quotes');
  const missingVatModeRows=docs.filter(row=>['productions','invoices','receipts'].includes(row._type)&&!['add','extract','none'].includes(resolveVatMode(row)));
  const invoiceLinkRows=(data.invoices||[]).filter(row=>analyticsHasMissingText(row.sourceProductionNo)&&analyticsHasMissingText(row.sourceProductionId));
  const receiptLinkRows=(data.receipts||[]).filter(row=>analyticsHasMissingText(row.invNo)&&analyticsHasMissingText(row.sourceInvoiceNo));
  const missingAgencyRows=docs.filter(row=>!analyticsHasMissingText(analyticsCustomer(row))&&customerAgencyForRecord(row).customerAgencyType==='other');
  missingDateRows.slice(0,3).forEach(row=>addSample(row._type,row,'ไม่มีวันที่'));
  missingCustomerRows.slice(0,3).forEach(row=>addSample(row._type,row,'ไม่มีชื่อลูกค้า'));
  zeroAmountRows.slice(0,3).forEach(row=>addSample(row._type,row,'ยอดเป็นศูนย์หรือติดลบ'));
  missingVatModeRows.slice(0,3).forEach(row=>addSample(row._type,row,'รูปแบบ VAT ไม่ชัดเจน'));
  invoiceLinkRows.slice(0,3).forEach(row=>addSample('invoices',row,'ใบส่งสินค้าไม่เชื่อมใบสั่งผลิต'));
  receiptLinkRows.slice(0,3).forEach(row=>addSample('receipts',row,'ใบเสร็จไม่เชื่อมใบส่งสินค้า'));
  missingAgencyRows.slice(0,3).forEach(row=>addSample(row._type,row,'ยังไม่พบประเภทหน่วยงานจากชื่อลูกค้า'));
  const total=docs.length;
  const missingDate=missingDateRows.length;
  const missingCustomer=missingCustomerRows.length;
  const zeroAmount=zeroAmountRows.length;
  const missingVatMode=missingVatModeRows.length;
  const linkIssues=invoiceLinkRows.length+receiptLinkRows.length;
  const missingAgency=missingAgencyRows.length;
  const issues=missingDate+missingCustomer+zeroAmount+duplicates+missingVatMode+linkIssues+missingAgency;
  const score=total?Math.max(0,Math.min(100,100-(issues/Math.max(1,total*2))*100)):100;
  return{total,missingDate,missingCustomer,zeroAmount,duplicates,missingVatMode,linkIssues,missingAgency,issues,score:roundMoneyValue(score),samples};
}
function analyticsDeliveryRows(data){
  const rows=[];
  (data.productions||[]).forEach(row=>{
    if(shouldMirrorHistoricalSalesAsDelivery(row._year,row._month))rows.push({...row,_deliverySource:'historical-sales-mirror'});
  });
  (data.invoices||[]).forEach(row=>{
    if(!shouldMirrorHistoricalSalesAsDelivery(row._year,row._month))rows.push({...row,_deliverySource:'invoice'});
  });
  return rows;
}
function analyticsDeliveryValue(row){return row?._deliverySource==='historical-sales-mirror'?productionNetSalesValue(row):invoiceNetSales(row);}
function buildAnalyticsKpis(data,filter){
  const salesRows=data.productions||[];
  const deliveryRows=analyticsDeliveryRows(data);
  const sales=sumBy(salesRows,productionNetSalesValue);
  const quotes=sumBy(data.quotes,row=>analyticsSalesValue({...row,_type:'quotes'}));
  const delivery=sumBy(deliveryRows,analyticsDeliveryValue);
  const receipts=sumBy(data.receipts,invoiceNetSales);
  const cost=sumBy(salesRows,row=>row.costTotal??row.costSubtotal??row.costGrandTotal);
  const commission=sumBy(salesRows,analyticsCommissionValue);
  const expenses=sumBy(data.expenses,row=>row.amount);
  const grossProfit=sales-cost-commission;
  const profit=sumBy(salesRows,analyticsProfitValue)-expenses;
  const orderCount=salesRows.length;
  const invoiceCount=deliveryRows.length;
  const receiptCount=data.receipts.length;
  const avgOrder=orderCount?sales/orderCount:0;
  const avgDelivery=invoiceCount?delivery/invoiceCount:0;
  const avgReceipt=receiptCount?receipts/receiptCount:0;
  const grossMargin=ratioPercent(grossProfit,sales);
  const netMargin=ratioPercent(profit,sales);
  const deliveryRate=ratioPercent(delivery,sales);
  const collectionRate=ratioPercent(receipts,delivery);
  const quoteToSalesRate=ratioPercent(sales,quotes);
  const deliveryGap=sales-delivery;
  const uncollected=delivery-receipts;
  const customers=new Set(salesRows.map(analyticsCustomer).filter(x=>x&&x!=='ไม่ระบุลูกค้า'));
  const products=new Set(analyticsItemRows(salesRows).map(row=>row.product).filter(Boolean));
  return{sales,quotes,delivery,deliveryRows,receipts,cost,commission,expenses,profit,grossProfit,grossMargin,netMargin,deliveryRate,collectionRate,quoteToSalesRate,deliveryGap,uncollected,avgOrder,avgDelivery,avgReceipt,orderCount,invoiceCount,receiptCount,customerCount:customers.size,productCount:products.size,
    docs:data.quotes.length+data.productions.length+data.invoices.length+data.receipts.length+data.issuedInvoices.length+data.issuedReceipts.length+data.expenses.length};
}
function analyticsMonthlyPoint(year,month,branch,agencyGroup='',agencyType=''){
  const data=collectAnalyticsData({year,month,branch,agencyGroup,agencyType,focus:'sales'});
  const k=buildAnalyticsKpis(data,{year,month,branch});
  const name=MONTHS[month];
  return{label:name,year,month,value:k.sales,delivery:k.delivery,receipts:k.receipts,profit:k.profit,margin:k.netMargin,deliveryRate:k.deliveryRate,collectionRate:k.collectionRate,docs:k.docs,orders:k.orderCount,customers:k.customerCount,sub:`${name} พ.ศ. ${yearLabelDual(year)}`};
}
function analyticsMonthlySeries(year,branch,agencyGroup='',agencyType=''){
  return MONTHS.map((_,month)=>analyticsMonthlyPoint(year,month,branch,agencyGroup,agencyType));
}
function analyticsForecastHistorySeries(year,branch,agencyGroup='',agencyType='',selectedMonth=''){
  let endMonth=selectedMonth===''?11:Number(selectedMonth);
  if(selectedMonth===''&&Number(year)===now.getFullYear())endMonth=Math.max(0,now.getMonth()-1);
  const endKey=forecastMonthKey(Number(year),endMonth);
  const rows=[];
  for(let offset=35;offset>=0;offset--){
    const d=forecastMonthFromKey(endKey-offset);
    rows.push(analyticsMonthlyPoint(d.year,d.month,branch,agencyGroup,agencyType));
  }
  return rows;
}
function movingAverage(values,windowSize=3){
  const clean=forecastActiveSeries(values);
  if(!clean.length)return 0;
  const slice=clean.slice(-Math.min(windowSize,clean.length));
  return forecastMean(slice);
}
function linearRegressionForecast(values){
  const fit=forecastLinearFit(values,1);
  const active=forecastActiveSeries(values);
  let trend='ข้อมูลยังน้อย';
  if(active.length>=2)trend=fit.slope>0?'แนวโน้มเพิ่มขึ้น':fit.slope<0?'แนวโน้มลดลง':'ทรงตัว';
  return{forecast:roundMoneyValue(fit.forecast[0]||0),slope:roundMoneyValue(fit.slope||0),r2:roundMoneyValue(fit.r2||0),trend};
}
function buildForecastModel(values,method='auto'){
  const active=forecastActiveSeries(values);
  const standard=buildStandardForecastModel(active,method,6);
  const linear=linearRegressionForecast(active);
  const sma=forecastModelRun('sma',active,1).forecast[0]||0;
  const ses=forecastModelRun('ses',active,1);
  const holt=forecastModelRun('holt',active,1);
  const hw=forecastModelRun('hw',active,1);
  return{
    ...standard,
    ma3:roundMoneyValue(sma),
    exp:roundMoneyValue(ses.forecast[0]||0),
    holt:roundMoneyValue(holt.forecast[0]||0),
    hw:roundMoneyValue(hw.forecast[0]||0),
    linear,
    count:active.length
  };
}
function analyticsTrendSummary(rows,selectedMonth,metric='value',method='auto',historyRows=[]){
  const series=selectedMonth===''?rows:rows.slice(0,Number(selectedMonth)+1);
  const values=series.map(r=>r[metric]??r.value);
  const lastIndex=[...values].reduce((last,v,i)=>safeNum(v)>0?i:last,-1);
  const current=lastIndex>=0?series[lastIndex]:series[series.length-1]||rows[0];
  const prev=lastIndex>0?series[lastIndex-1]:null;
  const modelRows=historyRows.length?historyRows:series;
  const modelValues=modelRows.map(r=>r[metric]??r.value);
  const avg3=movingAverage(modelValues,3);
  const mom=prev&&safeNum(prev[metric]??prev.value)>0?(safeNum(current?.[metric]??current?.value)-safeNum(prev[metric]??prev.value))/safeNum(prev[metric]??prev.value)*100:0;
  const forecastModel=buildForecastModel(modelValues,method);
  const active=forecastActiveSeries(modelValues);
  const mean=forecastMean(active);
  const variance=active.length?active.reduce((s,v)=>s+Math.pow(v-mean,2),0)/active.length:0;
  const volatility=mean>0?Math.sqrt(variance)/mean*100:0;
  const best=rows.slice().sort((a,b)=>safeNum(b[metric]??b.value)-safeNum(a[metric]??a.value))[0];
  const worst=rows.filter(r=>safeNum(r[metric]??r.value)>0).sort((a,b)=>safeNum(a[metric]??a.value)-safeNum(b[metric]??b.value))[0];
  let forecastBase=null;
  for(let i=modelRows.length-1;i>=0;i--){if(safeNum(modelRows[i]?.[metric]??modelRows[i]?.value)>0){forecastBase=modelRows[i];break;}}
  return{current,prev,avg3,mom,forecast:forecastModel.forecast,forecastModel,volatility:roundMoneyValue(volatility),best,worst,total:modelValues.reduce((s,v)=>s+safeNum(v),0),mean:roundMoneyValue(mean),lastIndex,forecastBase};
}
function buildCustomerDeepRows(data){
  const map=new Map();
  const ensure=(name)=>{const key=String(name||'ไม่ระบุลูกค้า').trim()||'ไม่ระบุลูกค้า';const cur=map.get(key)||{label:key,sales:0,delivery:0,receipts:0,profit:0,count:0,lastDate:null,rows:[]};map.set(key,cur);return cur;};
  (data.productions||[]).forEach(row=>{const cur=ensure(analyticsCustomer(row));cur.sales+=productionNetSalesValue(row);cur.profit+=analyticsProfitValue(row);cur.count+=1;cur.rows.push(row);const d=analyticsDateObj(row);if(!cur.lastDate||d>cur.lastDate)cur.lastDate=d;});
  analyticsDeliveryRows(data).forEach(row=>{ensure(analyticsCustomer(row)).delivery+=analyticsDeliveryValue(row);});
  (data.receipts||[]).forEach(row=>{ensure(analyticsCustomer(row)).receipts+=invoiceNetSales(row);});
  const rows=Array.from(map.values()).map(row=>({
    ...row,
    avgOrder:row.count?row.sales/row.count:0,
    margin:ratioPercent(row.profit,row.sales),
    deliveryGap:row.sales-row.delivery,
    uncollected:row.delivery-row.receipts,
    lastDateText:row.lastDate?formatThaiDate(row.lastDate):'-'
  })).sort((a,b)=>safeNum(b.sales)-safeNum(a.sales));
  return calculateAbcRows(rows.map(row=>({...row,value:row.sales})));
}
function buildAgencyRows(data){
  const primary=analyticsPrimarySalesRows(data);
  const ensure=(record)=>{
    const agency=customerAgencyForRecord(record||{});
    const key=`${agency.customerAgencyGroup}|${agency.customerAgencyType}`;
    if(!map.has(key))map.set(key,{key,group:agency.customerAgencyGroup,groupLabel:agency.customerAgencyGroupLabel,type:agency.customerAgencyType,typeLabel:agency.customerAgencyTypeLabel,prefix:agency.customerPrefix,label:`${agency.customerAgencyGroupLabel} / ${agency.customerAgencyTypeLabel}`,sales:0,delivery:0,receipts:0,profit:0,count:0,customers:new Set(),rows:[]});
    return map.get(key);
  };
  const map=new Map();
  primary.forEach(row=>{const cur=ensure(row);cur.sales+=analyticsSalesValue(row);cur.profit+=analyticsProfitValue(row);cur.count+=1;cur.customers.add(analyticsCustomer(row));cur.rows.push(row);});
  analyticsDeliveryRows(data).forEach(row=>{const cur=ensure(row);cur.delivery+=analyticsDeliveryValue(row);cur.customers.add(analyticsCustomer(row));});
  (data.receipts||[]).forEach(row=>{const cur=ensure(row);cur.receipts+=invoiceNetSales(row);cur.customers.add(analyticsCustomer(row));});
  const total=[...map.values()].reduce((s,r)=>s+r.sales,0);
  return [...map.values()].map(row=>({
    ...row,
    customerCount:[...row.customers].filter(x=>x&&x!=='ไม่ระบุลูกค้า').length,
    margin:ratioPercent(row.profit,row.sales),
    uncollected:row.delivery-row.receipts,
    contributionPercent:ratioPercent(row.sales,total)
  })).sort((a,b)=>safeNum(b.sales)-safeNum(a.sales));
}
function buildBusinessSegmentCards(agencyRows=[]){
  const groups=new Map();
  agencyRows.forEach(row=>{
    const key=row.group||'other';
    const cur=groups.get(key)||{group:key,label:agencyGroupLabel(key),sales:0,delivery:0,receipts:0,profit:0,uncollected:0,count:0,customerCount:0};
    cur.sales+=safeNum(row.sales);cur.delivery+=safeNum(row.delivery);cur.receipts+=safeNum(row.receipts);cur.profit+=safeNum(row.profit);cur.uncollected+=Math.max(0,safeNum(row.uncollected));cur.count+=safeNum(row.count);cur.customerCount+=safeNum(row.customerCount);groups.set(key,cur);
  });
  const order=['government_coop_association','hospital','school','private_company'];
  const root=document.getElementById('business-segment-cards');if(!root)return;
  root.innerHTML=order.map(key=>{
    const row=groups.get(key)||{label:agencyGroupLabel(key),sales:0,delivery:0,receipts:0,profit:0,uncollected:0,count:0,customerCount:0};
    const margin=ratioPercent(row.profit,row.sales);
    const receiptRate=ratioPercent(row.receipts,row.delivery);
    const badge=key==='government_coop_association'?'ราชการ':key==='private_company'?'เอกชน':row.label;
    return `<div class="business-segment-card ${key}">
      <div class="segment-top"><span>${escapeHtml(badge)}</span><b>${escapeHtml(row.label)}</b></div>
      <div class="segment-value">${chartMoney(row.sales)}</div>
      <div class="segment-grid">
        <span>กำไร <b>${chartMoney(row.profit)}</b></span>
        <span>Margin <b>${percentText(margin)}</b></span>
        <span>รับเงิน <b>${percentText(receiptRate)}</b></span>
        <span>ค้างรับ <b>${chartMoney(row.uncollected)}</b></span>
      </div>
      <small>ลูกค้า ${fmt(row.customerCount)} ราย · เอกสาร ${fmt(row.count)} รายการ</small>
    </div>`;
  }).join('');
}
function customerBusinessAction(row){
  const deliveryGap=Math.max(0,safeNum(row.deliveryGap));
  const uncollected=Math.max(0,safeNum(row.uncollected));
  const margin=safeNum(row.margin);
  const actions=[];
  let level='ติดตามปกติ';
  if(uncollected>0){level='ติดตามเครดิต';actions.push('ติดตามการชำระเงินและวันครบกำหนดเครดิต');}
  if(deliveryGap>0){level=level==='ติดตามปกติ'?'ติดตามการส่งสินค้า':level;actions.push('ตรวจงานที่ยังไม่ออกใบส่งสินค้า / ใบกำกับภาษี');}
  if(margin>0&&margin<10){level='ตรวจราคา/ต้นทุน';actions.push('ตรวจต้นทุน ราคาขาย และคอมมิชชัน เพราะ Margin ต่ำ');}
  if(row.abc==='A')actions.push('จัดเป็นลูกค้าหลัก ควรดูแลความสัมพันธ์และรอบการสั่งซ้ำ');
  if(!actions.length)actions.push('รักษาระดับบริการและติดตามโอกาสสั่งซื้อซ้ำ');
  return{level,action:actions.slice(0,3).join(' · ')};
}
function buildCustomerBusinessStrategyRows(customerRows=[]){
  return customerRows.map(row=>{
    const agency=customerAgencyForRecord(row.rows?.[0]||{customer:row.label});
    const action=customerBusinessAction(row);
    const score=(row.abc==='A'?40:row.abc==='B'?20:5)+(Math.max(0,row.uncollected)>0?35:0)+(Math.max(0,row.deliveryGap)>0?20:0)+(row.margin>0&&row.margin<10?25:0);
    return{...row,agency,actionLevel:action.level,actionText:action.action,priorityScore:score};
  }).sort((a,b)=>safeNum(b.priorityScore)-safeNum(a.priorityScore)||safeNum(b.sales)-safeNum(a.sales));
}

function buildProductDeepRows(data,selectedProduct=''){
  let itemRows=analyticsItemRows(analyticsPrimarySalesRows(data));
  if(selectedProduct)itemRows=itemRows.filter(row=>normalizeProductKey(row.product)===normalizeProductKey(selectedProduct));
  const total=itemRows.reduce((s,r)=>s+safeNum(r.value),0);
  return groupAnalytics(itemRows,row=>row.product,row=>row.value).map(row=>{
    const qty=row.rows.reduce((s,r)=>s+safeNum(r.qty),0);
    const customers=new Set(row.rows.map(r=>r.customer).filter(Boolean));
    const units=[...new Set(row.rows.map(r=>r.unit).filter(Boolean))].slice(0,3).join(', ');
    const categories=[...new Set(row.rows.map(r=>r.productCategory).filter(Boolean))];
    const codes=[...new Set(row.rows.map(r=>r.productCode).filter(Boolean))];
    return{...row,qty,units,productCategory:categories[0]||'อื่น ๆ',productCode:codes[0]||'',avgPrice:qty?row.value/qty:0,customerCount:customers.size,contributionPercent:ratioPercent(row.value,total)};
  });
}
function buildProductSeasonality(filter,selectedProduct=''){
  const yearData=collectAnalyticsData({...filter,month:''});
  let items=analyticsItemRows(analyticsPrimarySalesRows(yearData));
  if(selectedProduct)items=items.filter(r=>normalizeProductKey(r.product)===normalizeProductKey(selectedProduct));
  const months=MONTHS.map((label,month)=>({month,label,value:0,qty:0,count:0,customers:new Set()}));
  items.forEach(row=>{
    const d=analyticsDateObj(row);const m=Number.isInteger(row._month)?Number(row._month):(d?d.getMonth():0);
    if(m<0||m>11)return;const x=months[m];x.value+=safeNum(row.value);x.qty+=safeNum(row.qty);x.count+=1;if(row.customer)x.customers.add(row.customer);
  });
  const monthRows=months.map(x=>({...x,value:roundMoneyValue(x.value),qty:roundMoneyValue(x.qty),customerCount:x.customers.size}));
  const quarterRows=[0,1,2,3].map(q=>{
    const rows=monthRows.slice(q*3,q*3+3);return{quarter:q+1,label:`ไตรมาส ${q+1} (Q${q+1})`,value:roundMoneyValue(rows.reduce((s,r)=>s+r.value,0)),qty:roundMoneyValue(rows.reduce((s,r)=>s+r.qty,0)),count:rows.reduce((s,r)=>s+r.count,0),customerCount:new Set(items.filter(r=>{const m=Number.isInteger(r._month)?Number(r._month):analyticsDateObj(r)?.getMonth();return Math.floor(Number(m)/3)===q;}).map(r=>r.customer).filter(Boolean)).size};
  });
  const bestMonth=monthRows.filter(r=>r.value>0).sort((a,b)=>b.value-a.value)[0]||null;
  const bestQuarter=quarterRows.filter(r=>r.value>0).sort((a,b)=>b.value-a.value)[0]||null;
  return{items,monthRows,quarterRows,bestMonth,bestQuarter,total:roundMoneyValue(monthRows.reduce((s,r)=>s+r.value,0))};
}
function renderProductSeasonality(filter,selectedProduct=''){
  const result=buildProductSeasonality(filter,selectedProduct);
  const title=selectedProduct||'สินค้าทั้งหมด';
  renderBarRows('analytics-product-season-chart',result.monthRows.map(r=>({label:r.label,value:r.value,sub:`จำนวน ${fmt(r.qty)} · ${r.count} รายการ · ลูกค้า ${r.customerCount} ราย`})),{fillClass:'purple'});
  const summary=document.getElementById('analytics-product-season-summary');
  if(summary)summary.innerHTML=result.total?`<b>${escapeHtml(title)}</b> · เดือนขายดีที่สุด <b>${escapeHtml(result.bestMonth?.label||'-')}</b> ${chartMoney(result.bestMonth?.value||0)} · ไตรมาสขายดีที่สุด <b>${escapeHtml(result.bestQuarter?.label||'-')}</b> ${chartMoney(result.bestQuarter?.value||0)} · ยอดทั้งปี ${chartMoney(result.total)}`:'ยังไม่มีข้อมูลยอดขายสินค้านี้ในปีที่เลือก';
  analyticsRenderTable('analytics-product-quarter-table',[
    {label:'ไตรมาส',html:r=>escapeHtml(r.label)},
    {label:'ยอดขาย',html:r=>chartMoney(r.value),cls:'num'},
    {label:'จำนวน',html:r=>fmt(r.qty),cls:'num'},
    {label:'ลูกค้า',html:r=>fmt(r.customerCount),cls:'num'},
    {label:'รายการ',html:r=>fmt(r.count),cls:'num'}
  ],result.quarterRows.filter(r=>r.value>0),'ยังไม่มีข้อมูลยอดขายรายไตรมาส');
}
function buildSalespersonRows(data){
  const rows=analyticsPrimarySalesRows(data);
  const groups=groupAnalytics(rows,analyticsSalesperson,analyticsSalesValue);
  return groups.map(row=>{
    const profit=row.rows.reduce((s,r)=>s+analyticsProfitValue(r),0);
    const customers=new Set(row.rows.map(analyticsCustomer).filter(Boolean));
    return{...row,sales:row.value,profit,margin:ratioPercent(profit,row.value),avgOrder:row.count?row.value/row.count:0,customerCount:customers.size};
  });
}
function buildBranchRows(filter){
  return analyticsBranchList(filter.branch).map(branch=>{
    const data=collectAnalyticsData({...filter,branch});
    const k=buildAnalyticsKpis(data,{...filter,branch});
    return{branch,label:BRANCH_TH[branch]||branch,...k};
  });
}
function buildAnalyticsFunnel(kpis){
  return[
    {label:'ยอดขาย/สั่งผลิต',value:kpis.sales,rate:100,detail:`${kpis.orderCount} รายการ`},
    {label:'ยอดส่งสินค้า',value:kpis.delivery,rate:ratioPercent(kpis.delivery,kpis.sales),detail:`${kpis.invoiceCount} รายการ`},
    {label:'ยอดรับเงินตามใบเสร็จ',value:kpis.receipts,rate:ratioPercent(kpis.receipts,kpis.sales),detail:`${kpis.receiptCount} รายการ`}
  ];
}
function analyticsDaysFromToday(isoDate){
  const d=parseIsoLocalDate(isoDate);
  if(!d)return null;
  const today=new Date();today.setHours(0,0,0,0);
  return Math.round((d.getTime()-today.getTime())/86400000);
}
function analyticsAttentionBadge(state,text){
  const cls={paid:'green',done:'green',normal:'blue',soon:'amber',dueToday:'amber',overdue:'red',missing:'red',none:'gray'}[state]||'gray';
  return `<span class="badge b-${cls}">${escapeHtml(text||'-')}</span>`;
}
function analyticsUniqueKeys(values){
  return [...new Set(values.map(v=>String(v||'').trim()).filter(Boolean))];
}
function analyticsInvoiceKeys(inv={}){
  return analyticsUniqueKeys([inv.no,inv.docNo,inv.invoiceNo,inv.id,inv.firebaseId,inv.documentId]);
}
function analyticsReceiptInvoiceKeys(receipt={}){
  return analyticsUniqueKeys([receipt.invNo,receipt.sourceInvoiceNo,receipt.invoiceNo,receipt.refInvoiceNo,receipt.referenceInvoiceNo,receipt.sourceInvoiceId,receipt.invoiceId,receipt.paidInvoiceNo]);
}
function buildReceiptPaymentMap(receipts=[]){
  const map=new Map();
  receipts.forEach(receipt=>{
    const keys=analyticsReceiptInvoiceKeys(receipt);
    if(!keys.length)return;
    const primary=keys[0].toLowerCase();
    map.set(primary,(map.get(primary)||0)+invoiceNetSales(receipt));
  });
  return map;
}
function buildReceivableAgingRows(data){
  const paidMap=buildReceiptPaymentMap(data.receipts||[]);
  return (data.invoices||[]).map(inv=>{
    const delivery=invoiceNetSales(inv);
    const paid=analyticsInvoiceKeys(inv).reduce((sum,key)=>sum+(paidMap.get(key.toLowerCase())||0),0);
    const outstanding=roundMoneyValue(Math.max(0,delivery-paid));
    const dueDate=getInvoiceDueDate(inv);
    const days=analyticsDaysFromToday(dueDate);
    let bucket='ยังไม่ครบกำหนด',state='normal';
    if(outstanding<=0){bucket='รับเงินครบแล้ว';state='paid';}
    else if(days===null){bucket='ไม่ระบุวันครบกำหนด';state='none';}
    else if(days<0&&Math.abs(days)<=7){bucket='เกินกำหนด 1–7 วัน';state='overdue';}
    else if(days<0&&Math.abs(days)<=15){bucket='เกินกำหนด 8–15 วัน';state='overdue';}
    else if(days<0&&Math.abs(days)<=30){bucket='เกินกำหนด 16–30 วัน';state='overdue';}
    else if(days<0){bucket='เกินกำหนดมากกว่า 30 วัน';state='overdue';}
    else if(days===0){bucket='ครบกำหนดวันนี้';state='dueToday';}
    else if(days<=7){bucket='ใกล้ครบกำหนด 1–7 วัน';state='soon';}
    return{docNo:analyticsDocNo(inv),customer:analyticsCustomer(inv),salesperson:analyticsSalesperson(inv),date:analyticsDateLabel(inv),dueDate,dueText:dueDate?formatThaiDate(dueDate):'-',days,delivery,paid,outstanding,bucket,state,creditTerm:invoiceCreditTermLabel(inv.creditTerm),branch:inv.branch};
  }).filter(row=>row.delivery>0).sort((a,b)=>{
    if(a.outstanding>0&&b.outstanding<=0)return-1;
    if(a.outstanding<=0&&b.outstanding>0)return 1;
    return (a.days??9999)-(b.days??9999);
  });
}
function analyticsProductionLinkedInvoice(production,invoices=[]){
  const keys=analyticsUniqueKeys([production.no,production.id,production.firebaseId]).map(x=>x.toLowerCase());
  return invoices.find(inv=>analyticsUniqueKeys([inv.sourceProductionNo,inv.sourceProductionId,inv.productionNo,inv.productionId]).map(x=>x.toLowerCase()).some(k=>keys.includes(k)));
}
function buildDeliveryControlRows(data){
  return (data.productions||[]).map(p=>{
    const inv=analyticsProductionLinkedInvoice(p,data.invoices||[]);
    const dueDate=getProductionDeliveryDueDate(p);
    const days=analyticsDaysFromToday(dueDate);
    const hasInvoice=Boolean(inv);
    let state='normal',text='รอถึงกำหนด';
    if(hasInvoice){state='done';text='มีใบส่งสินค้า / ใบกำกับภาษีแล้ว';}
    else if(!dueDate){state='none';text='ยังไม่ระบุระยะเวลาส่งสินค้า';}
    else if(days<0){state='overdue';text=`เลยกำหนดส่ง ${Math.abs(days)} วัน`;}
    else if(days===0){state='dueToday';text='ครบกำหนดส่งวันนี้';}
    else if(days<=7){state='soon';text=`ใกล้ส่งใน ${days} วัน`;}
    return{productionNo:p.no||'-',customer:analyticsCustomer(p),job:p.job||'-',lead:productionDeliveryLeadLabel(p.deliveryLeadDays||p.shippingLeadDays),dueDate,dueText:dueDate?formatThaiDate(dueDate):'-',days,amount:productionNetSalesValue(p),invoiceNo:inv?.no||'',state,text,branch:p.branch};
  }).sort((a,b)=>{
    const score=x=>x.state==='overdue'?0:x.state==='dueToday'?1:x.state==='soon'?2:x.state==='none'?3:x.state==='normal'?4:5;
    return score(a)-score(b)||(a.days??9999)-(b.days??9999);
  });
}
function buildSupplierPayableRows(data){
  return (data.productions||[]).map(p=>{
    const dueDate=getProductionSupplierDueDate(p);
    const days=analyticsDaysFromToday(dueDate);
    const paid=p.supplierPaymentStatus==='paid';
    let state='normal',text='รอถึงกำหนด';
    if(paid){state='paid';text='ชำระแล้ว';}
    else if(!dueDate){state='none';text='ยังไม่ระบุเครดิตผู้ผลิต';}
    else if(days<0){state='overdue';text=`เกินกำหนดจ่าย ${Math.abs(days)} วัน`;}
    else if(days===0){state='dueToday';text='ครบกำหนดจ่ายวันนี้';}
    else if(days<=7){state='soon';text=`ใกล้ครบกำหนด ${days} วัน`;}
    return{productionNo:p.no||'-',maker:p.maker||'-',customer:analyticsCustomer(p),credit:productionSupplierCreditLabel(p.supplierCreditTerm||'deliveryLead',p),lead:productionDeliveryLeadLabel(p.deliveryLeadDays||p.shippingLeadDays),dueDate,dueText:dueDate?formatThaiDate(dueDate):'-',days,amount:safeNum(p.costGrandTotal??p.costTotal??p.costSubtotal),status:productionSupplierPaymentStatusLabel(p.supplierPaymentStatus),state,text,branch:p.branch};
  }).sort((a,b)=>{
    const score=x=>x.state==='overdue'?0:x.state==='dueToday'?1:x.state==='soon'?2:x.state==='none'?3:x.state==='normal'?4:5;
    return score(a)-score(b)||(a.days??9999)-(b.days??9999);
  });
}
function analyticsSumRows(rows,field,fn=(x)=>x){return rows.reduce((sum,row)=>sum+safeNum(fn(row[field],row)),0);}
function renderAnalyticsExecutiveSummary(kpis,quality,trend,arRows,deliveryRows,supplierRows,filter){
  const el=document.getElementById('analytics-executive-summary');if(!el)return;
  const overdueAr=arRows.filter(r=>r.outstanding>0&&r.state==='overdue');
  const dueSoonAr=arRows.filter(r=>r.outstanding>0&&(r.state==='soon'||r.state==='dueToday'));
  const overdueDelivery=deliveryRows.filter(r=>r.state==='overdue');
  const dueSoonDelivery=deliveryRows.filter(r=>r.state==='soon'||r.state==='dueToday');
  const overdueSupplier=supplierRows.filter(r=>r.state==='overdue');
  const dueSoonSupplier=supplierRows.filter(r=>r.state==='soon'||r.state==='dueToday');
  const periodText=filter.month===''?`ทั้งปี พ.ศ. ${yearLabelDual(filter.year)}`:`${MONTHS[filter.month]} พ.ศ. ${yearLabelDual(filter.year)}`;
  const mirrorNote=Number(filter.year)===2026 && (filter.month==='' || Number(filter.month)<=5)
    ? '<div class="analytics-note">หมายเหตุ: เดือน ม.ค.–มิ.ย. พ.ศ. 2569 ระบบใช้ยอดขายย้อนหลังเป็นยอดส่งสินค้าแทน เพื่อไม่สร้างใบส่งสินค้าซ้ำใน Firebase</div>' : '';
  el.innerHTML=`<div class="analytics-executive-card">
    <div><small>สรุปสำหรับผู้บริหาร</small><b>${escapeHtml(periodText)}</b><span>ยอดขาย ${chartMoney(kpis.sales)} · กำไรสุทธิ ${chartMoney(kpis.profit)} · คุณภาพข้อมูล ${quality.score}/100</span></div>
    <div><small>เงินที่ต้องติดตาม</small><b>${chartMoney(overdueAr.reduce((s,r)=>s+r.outstanding,0))}</b><span>เกินกำหนด ${overdueAr.length} บิล · ใกล้ครบกำหนด ${dueSoonAr.length} บิล</span></div>
    <div><small>งานส่งสินค้า</small><b>${overdueDelivery.length}</b><span>เลยกำหนดส่ง · ใกล้ครบกำหนด ${dueSoonDelivery.length} งาน</span></div>
    <div><small>จ่ายผู้ผลิต</small><b>${chartMoney(overdueSupplier.reduce((s,r)=>s+r.amount,0))}</b><span>เกินกำหนด ${overdueSupplier.length} รายการ · ใกล้ครบกำหนด ${dueSoonSupplier.length} รายการ</span></div>
  </div>${mirrorNote}`;
}
function renderAnalyticsExplainPanel(){
  const el=document.getElementById('analytics-explain-panel');if(!el)return;
  el.innerHTML=`<div class="analytics-explain-grid">
    <div><b>1) ยอดขาย</b><p>อ่านจากรายการสั่งผลิตเป็นหลัก เพื่อสะท้อนงานที่เกิดขึ้นจริงในธุรกิจ หากเป็นเดือน ม.ค.–มิ.ย. 2569 ระบบใช้ยอดขายย้อนหลังช่วยแทนยอดส่งสินค้าใน Dashboard</p></div>
    <div><b>2) ยอดส่งสินค้า</b><p>อ่านจากใบส่งสินค้า / ใบกำกับภาษี ยกเว้นช่วงข้อมูลย้อนหลังเดือน 1–6 พ.ศ. 2569 ที่กำหนดให้ยอดส่งสินค้าเท่ากับยอดขาย เพื่อไม่สร้างเอกสารซ้ำ</p></div>
    <div><b>3) ยอดค้างรับเงิน</b><p>คำนวณจากยอดใบส่งสินค้า / ใบกำกับภาษี ลบยอดใบเสร็จรับเงินที่อ้างอิงบิลเดียวกัน ใช้ดูว่าควรติดตามเงินจากลูกค้ารายใดก่อน</p></div>
    <div><b>4) เครดิตลูกค้า</b><p>ใช้วันครบกำหนดจากใบส่งสินค้า / ใบกำกับภาษี แบ่งเป็น ใกล้ครบกำหนด, ครบกำหนดวันนี้, เกินกำหนด 1–7, 8–15, 16–30 และเกิน 30 วัน</p></div>
    <div><b>5) ระยะเวลาส่งสินค้า</b><p>ใช้วันที่สั่งผลิตบวกจำนวนวันส่งสินค้า เช่น 45 วัน เพื่อหางานที่ใกล้ส่งหรือเลยกำหนด ช่วยลดปัญหาส่งสินค้าไม่ทัน</p></div>
    <div><b>6) เครดิตผู้ผลิต</b><p>ค่าเริ่มต้นอิงระยะเวลาส่งสินค้า เช่น เลือกส่ง 30 วัน ระบบจะตั้งวันครบกำหนดชำระผู้ผลิตเป็น 30 วันหลังวันที่สั่งผลิต</p></div>
    <div><b>7) Data Quality</b><p>ตรวจเลขเอกสารซ้ำ วันที่หาย ลูกค้าหาย ยอดเป็นศูนย์ VAT ไม่ชัดเจน และเอกสารไม่เชื่อมกัน ก่อนนำตัวเลขไปตัดสินใจ</p></div>
    <div><b>8) Forecast</b><p>ใช้ Moving Average, Simple Exponential Smoothing, Holt Trend, Holt-Winters และ Linear Regression เป็น Benchmark โดยโหมด Auto เลือกโมเดลจาก Rolling-origin Cross-validation ที่มี RMSE ต่ำสุด และแสดงช่วงคาดการณ์เพื่อใช้ประกอบการตัดสินใจ</p></div>
  </div>`;
}
function buildAnalyticsInsights(kpis,quality,trend,abcRows,filter){
  const insights=[];
  if(quality.total===0)insights.push({type:'warn',title:'ยังไม่มีข้อมูลในช่วงนี้',text:'กรุณาเลือกเดือน/ปีหรือสาขาที่มีข้อมูลก่อนวิเคราะห์'});
  if(quality.score<90)insights.push({type:'warn',title:'ควรตรวจคุณภาพข้อมูล',text:`คะแนน Data Quality ${quality.score}/100 พบปัญหา ${quality.issues} จุด ก่อนใช้ตัวเลขวางแผนควรตรวจข้อมูลวันที่ ลูกค้า จำนวนเงิน VAT และการเชื่อมเอกสาร`});
  if(kpis.sales>0&&kpis.netMargin<10)insights.push({type:'danger',title:'กำไรสุทธิต่ำ',text:`Net Margin อยู่ที่ ${percentText(kpis.netMargin)} ควรตรวจต้นทุน ค่าคอมมิชชัน ค่าใช้จ่าย และราคาขายเฉลี่ย`});
  if(kpis.sales>0&&kpis.deliveryRate<70)insights.push({type:'warn',title:'ยอดส่งสินค้าต่ำกว่ายอดขาย',text:`Delivery Rate ${percentText(kpis.deliveryRate)} อาจมีงานค้างส่งหรือเอกสารใบส่งสินค้า / ใบกำกับภาษียังไม่ได้บันทึก`});
  if(kpis.delivery>0&&kpis.collectionRate<75)insights.push({type:'warn',title:'ยอดเก็บเงินตามใบเสร็จยังต่ำ',text:`Collection Rate ${percentText(kpis.collectionRate)} ควรติดตามใบเสร็จหรือสถานะรับชำระจากลูกค้า`});
  if(trend.avg3>0&&trend.current&&safeNum(trend.current.value)<trend.avg3*0.7)insights.push({type:'danger',title:'ยอดขายต่ำกว่าค่าเฉลี่ย 3 เดือน',text:`เดือน ${trend.current.label} มียอด ${chartMoney(trend.current.value)} ต่ำกว่าค่าเฉลี่ยย้อนหลัง ${chartMoney(trend.avg3)}`});
  if(trend.volatility>45)insights.push({type:'warn',title:'ยอดขายผันผวนสูง',text:`Coefficient of Variation ประมาณ ${percentText(trend.volatility)} ควรดูสาเหตุจากลูกค้ารายใหญ่ งานโปรเจกต์ หรือฤดูกาล`});
  const top=abcRows[0];
  const total=abcRows.reduce((s,r)=>s+safeNum(r.value),0);
  if(top&&total>0&&top.value/total>0.5)insights.push({type:'warn',title:'พึ่งพาลูกค้ารายใหญ่สูง',text:`ลูกค้าอันดับ 1 (${escapeHtml(top.label)}) คิดเป็น ${percentText(top.value/total*100)} ของยอดขาย ควรเพิ่มฐานลูกค้าเพื่อลดความเสี่ยง`});
  if(!insights.length)insights.push({type:'ok',title:'ภาพรวมปกติ',text:'ไม่พบสัญญาณผิดปกติเด่นชัดจากข้อมูลช่วงนี้ สามารถใช้ตัวเลขเพื่อวางแผนต่อได้'});
  return insights;
}
function analyticsBranchBadge(branch){return branch?bbr(branch):'<span class="badge b-gray">ไม่ระบุสาขา</span>';}
function analyticsBranchRowClass(row){return row?.branch==='khonkaen'?'analytics-row analytics-row-kk':row?.branch==='ubon'?'analytics-row analytics-row-ub':'analytics-row';}
function analyticsBranchTone(branch){return branch==='khonkaen'?'kk':branch==='ubon'?'ub':'blue';}
function analyticsRenderTable(containerId,columns,rows,emptyText='ยังไม่มีข้อมูลในช่วงที่เลือก',options={}){
  const el=document.getElementById(containerId);if(!el)return;
  if(!rows.length){el.innerHTML=`<div class="empty" style="padding:1rem">${escapeHtml(emptyText)}</div>`;return;}
  const rowClassFn=typeof options.rowClass==='function'?options.rowClass:()=>'';
  el.innerHTML=`<div class="analytics-table-wrap"><table class="analytics-table"><thead><tr>${columns.map(col=>`<th>${escapeHtml(col.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr class="${rowClassFn(row)||''}">${columns.map(col=>`<td class="${col.cls||''}">${col.html?col.html(row):escapeHtml(col.value?col.value(row):row[col.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderAnalyticsFunnel(containerId,rows){
  const el=document.getElementById(containerId);if(!el)return;
  const max=Math.max(...rows.map(r=>safeNum(r.value)),1);
  el.innerHTML=rows.map(row=>`<div class="analytics-funnel-row"><div class="analytics-funnel-head"><b>${escapeHtml(row.label)}</b><span>${chartMoney(row.value)} · ${percentText(row.rate)} ของยอดขาย</span></div><div class="analytics-funnel-track"><span style="width:${Math.max(row.value?2:0,row.value/max*100)}%"></span></div><small>${escapeHtml(row.detail||'')}</small></div>`).join('');
}
function renderDataAnalytics(){
  const root=document.getElementById('panel-analytics');
  if(!root)return;
  const filter=analyticsFilters();
  const data=collectAnalyticsData(filter);
  const kpis=buildAnalyticsKpis(data,filter);
  const quality=buildAnalyticsQuality(data);
  const series=analyticsMonthlySeries(filter.year,filter.branch,filter.agencyGroup,filter.agencyType);
  const metric=filter.focus==='delivery'?'delivery':filter.focus==='quality'?'profit':'value';
  const forecastHistory=analyticsForecastHistorySeries(filter.year,filter.branch,filter.agencyGroup,filter.agencyType,filter.month);
  const viewTrend=analyticsTrendSummary(series,filter.month,metric,filter.forecastMethod,forecastHistory);
  const forecastTrend=analyticsTrendSummary(series,filter.month,'value',filter.forecastMethod,forecastHistory);
  const primaryRows=analyticsPrimarySalesRows(data);
  const customerGroups=buildCustomerDeepRows(data);
  const agencyRows=buildAgencyRows(data);
  const observedProducts=[...new Set(analyticsItemRows(analyticsPrimarySalesRows(data)).map(r=>r.product).filter(Boolean))];
  populateAnalyticsProductFilter(observedProducts);
  const productGroups=buildProductDeepRows(data,filter.product);
  const salespersonRows=buildSalespersonRows(data);
  const branchRows=buildBranchRows(filter);
  const arRows=buildReceivableAgingRows(data);
  const deliveryControlRows=buildDeliveryControlRows(data);
  const supplierPayableRows=buildSupplierPayableRows(data);
  const insights=buildAnalyticsInsights(kpis,quality,forecastTrend,customerGroups,filter);
  const periodText=filter.month===''?`ทั้งปี พ.ศ. ${yearLabelDual(filter.year)}`:`${MONTHS[filter.month]} พ.ศ. ${yearLabelDual(filter.year)}`;
  const branchText=filter.branch?BRANCH_TH[filter.branch]:'รวมทุกสาขา';
  const kpiEl=document.getElementById('analytics-kpis');
  if(kpiEl)kpiEl.innerHTML=
    analyticsKpi('ยอดขายก่อน VAT',chartMoney(kpis.sales),`${branchText} · ${periodText}`,'blue')+
    analyticsKpi('ยอดส่งสินค้า',chartMoney(kpis.delivery),`Delivery Rate ${percentText(kpis.deliveryRate)}`,'purple')+
    analyticsKpi('ยอดใบเสร็จ',chartMoney(kpis.receipts),`Collection Rate ${percentText(kpis.collectionRate)}`,'green')+
    analyticsKpi('กำไรสุทธิ',chartMoney(kpis.profit),`Net Margin ${percentText(kpis.netMargin)}`,kpis.profit>=0?'green':'red')+
    analyticsKpi('ยอดค้างส่ง',chartMoney(Math.max(0,kpis.deliveryGap)),`ยอดขาย - ยอดส่งสินค้า`,'amber')+
    analyticsKpi('ยอดค้างรับเงิน',chartMoney(Math.max(0,kpis.uncollected)),`ยอดส่งสินค้า - ใบเสร็จ`,'amber')+
    analyticsKpi('ค่าเฉลี่ยต่อเอกสาร',chartMoney(kpis.avgOrder),`${kpis.orderCount} เอกสารขาย`,'blue')+
    analyticsKpi('คุณภาพข้อมูล',`${quality.score}/100`,`${quality.issues} จุดที่ควรตรวจ`,quality.score>=90?'green':quality.score>=75?'amber':'red');
  const insightsEl=document.getElementById('analytics-insights');
  if(insightsEl)insightsEl.innerHTML=insights.map(item=>`<div class="analytics-insight ${item.type}"><b>${item.title}</b><span>${item.text}</span></div>`).join('');
  renderAnalyticsExecutiveSummary(kpis,quality,forecastTrend,arRows,deliveryControlRows,supplierPayableRows,filter);
  buildBusinessSegmentCards(agencyRows);

  const trendRows=series.map(row=>({label:row.label,value:row[metric]??row.value,sub:`${row.sub} · กำไร ${chartMoney(row.profit)} · เอกสาร ${row.docs}`}));
  renderBarRows('analytics-trend-chart',trendRows,{fillClass:filter.focus==='delivery'?'purple':filter.focus==='quality'?'green':''});
  const trendLabel=document.getElementById('analytics-trend-label');
  if(trendLabel)trendLabel.textContent=`${branchText} · พ.ศ. ${yearLabelDual(filter.year)}`;
  const trendSummary=document.getElementById('analytics-trend-summary');
  if(trendSummary)trendSummary.innerHTML=`ยอดล่าสุดที่พบ: <b>${viewTrend.current?.label||'-'}</b> ${chartMoney((viewTrend.current?.[metric]??viewTrend.current?.value) || 0)} · เปลี่ยนจากเดือนก่อน ${percentText(viewTrend.mom)} · ค่าเฉลี่ยย้อนหลัง 3 เดือน ${chartMoney(viewTrend.avg3)}${metric==='value'?` · Sales Forecast เดือนถัดไป ${chartMoney(forecastTrend.forecast)} (${escapeHtml(forecastTrend.forecastModel.label)})`:''}`;

  renderBarRows('analytics-customer-chart',customerGroups.slice(0,10).map(row=>({label:`${row.label} (${row.abc})`,value:row.sales,sub:`${row.count} เอกสาร · สัดส่วน ${percentText(row.contributionPercent)} · สะสม ${percentText(row.cumulativePercent)}`})),{fillClass:'green'});
  const customerSummary=document.getElementById('analytics-customer-summary');
  const aCount=customerGroups.filter(row=>row.abc==='A').length;
  if(customerSummary)customerSummary.innerHTML=`ลูกค้า Class A จำนวน <b>${aCount}</b> ราย สร้างยอดหลักประมาณ 80% แรกของช่วงที่เลือก · ลูกค้าทั้งหมด <b>${kpis.customerCount}</b> ราย`;

  renderBarRows('analytics-agency-chart',agencyRows.slice(0,10).map(row=>({label:row.typeLabel,value:row.sales,sub:`${row.groupLabel} · ลูกค้า ${row.customerCount} ราย · สัดส่วน ${percentText(row.contributionPercent)}`})),{fillClass:'blue'});
  const agencySummary=document.getElementById('analytics-agency-summary');
  if(agencySummary)agencySummary.innerHTML=agencyRows.length?`กลุ่มที่สร้างยอดสูงสุดคือ <b>${escapeHtml(agencyRows[0].typeLabel)}</b> (${escapeHtml(agencyRows[0].groupLabel)}) มูลค่า ${chartMoney(agencyRows[0].sales)} · ใช้ดูว่าธุรกิจพึ่งพาลูกค้ากลุ่มใดมากที่สุด`:'ยังไม่มีข้อมูลประเภทหน่วยงานในช่วงที่เลือก';

  renderBarRows('analytics-product-chart',productGroups.slice(0,10).map(row=>({label:row.label,value:row.value,sub:`จำนวนรวม ${fmt(row.qty)} ${row.units||''} · ลูกค้า ${row.customerCount} ราย · สัดส่วน ${percentText(row.contributionPercent)}`})),{fillClass:'purple'});
  const productSummary=document.getElementById('analytics-product-summary');
  if(productSummary)productSummary.innerHTML=productGroups.length?`สินค้าที่สร้างยอดสูงสุดคือ <b>${escapeHtml(productGroups[0].label)}</b> มูลค่า ${chartMoney(productGroups[0].value)} · ราคาเฉลี่ย ${chartMoney(productGroups[0].avgPrice)}/${escapeHtml(productGroups[0].units||'หน่วย')}`:'ยังไม่มีรายการสินค้าในช่วงที่เลือก';
  renderProductSeasonality(filter,filter.product);

  const qRows=[
    {label:'ไม่มีวันที่',value:quality.missingDate,sub:'เอกสารที่ไม่มี date'},
    {label:'ไม่มีชื่อลูกค้า',value:quality.missingCustomer,sub:'เอกสารขายที่ไม่ระบุ customer'},
    {label:'ยอดเป็นศูนย์/ติดลบ',value:quality.zeroAmount,sub:'ควรตรวจจำนวน ราคา และ VAT'},
    {label:'เลขเอกสารซ้ำ',value:quality.duplicates,sub:'อาจเกิดจาก Import หรือ Sync ซ้ำ'},
    {label:'VAT ไม่ชัดเจน',value:quality.missingVatMode,sub:'เอกสารที่ไม่มี vatMode ที่ถูกต้อง'},
    {label:'ลิงก์เอกสารไม่ครบ',value:quality.linkIssues,sub:'ใบส่งสินค้าหรือใบเสร็จที่ไม่อ้างอิงเอกสารก่อนหน้า'},
    {label:'ไม่พบประเภทหน่วยงาน',value:quality.missingAgency,sub:'ชื่อลูกค้าไม่มีคำย่อ/รูปแบบที่ระบบเดาได้'}
  ];
  renderBarRows('analytics-quality-chart',qRows,{fillClass:quality.score>=90?'green':'red',mode:'count'});
  const qualitySummary=document.getElementById('analytics-quality-summary');
  if(qualitySummary)qualitySummary.innerHTML=`ตรวจเอกสารทั้งหมด <b>${quality.total}</b> รายการ · คะแนนคุณภาพข้อมูล <b>${quality.score}/100</b> · ยิ่งคะแนนสูง ยิ่งเหมาะกับการใช้ทำ Dashboard และ Forecast`;

  const forecastEl=document.getElementById('analytics-forecast-summary');
  if(forecastEl)forecastEl.innerHTML=`<div class="analytics-formula-grid">
    <div class="${forecastTrend.forecastModel.selectedId==='sma'?'is-selected':''}"><span>Moving Average 3 เดือน</span><b>${chartMoney(forecastTrend.forecastModel.ma3)}</b><small>เหมาะกับข้อมูลค่อนข้างทรงตัว</small></div>
    <div class="${forecastTrend.forecastModel.selectedId==='ses'?'is-selected':''}"><span>Simple Exponential Smoothing</span><b>${chartMoney(forecastTrend.forecastModel.exp)}</b><small>ให้น้ำหนักข้อมูลใหม่มากกว่าข้อมูลเก่า</small></div>
    <div class="${forecastTrend.forecastModel.selectedId==='holt'?'is-selected':''}"><span>Holt Trend (Damped)</span><b>${chartMoney(forecastTrend.forecastModel.holt)}</b><small>รองรับแนวโน้มขึ้น/ลง</small></div>
    <div class="${forecastTrend.forecastModel.selectedId==='hw'?'is-selected':''}"><span>Holt-Winters Additive</span><b>${forecastTrend.forecastModel.count>=24?chartMoney(forecastTrend.forecastModel.hw):'ต้องมี ≥ 24 เดือน'}</b><small>รองรับ Trend + Seasonality ราย 12 เดือน</small></div>
  </div>`;
  const methodSummary=document.getElementById('analytics-method-summary');
  const selectedDiag=forecastTrend.forecastModel.candidates?.find(r=>r.id===forecastTrend.forecastModel.selectedId)||forecastTrend.forecastModel.cv||{};
  if(methodSummary)methodSummary.innerHTML=`ระบบใช้ <b>${escapeHtml(forecastTrend.forecastModel.label)}</b> เป็นค่าคาดการณ์หลัก เพราะ ${filter.forecastMethod==='auto'?'มี RMSE ต่ำสุดจาก Rolling-origin Cross-validation':'ผู้ใช้เลือกโมเดลนี้'} · CV RMSE ${Number.isFinite(forecastTrend.forecastModel.cv.rmse)?chartMoney(forecastTrend.forecastModel.cv.rmse):'—'} · WAPE ${Number.isFinite(selectedDiag.wape)?selectedDiag.wape.toFixed(1)+'%':'—'} · Bias ${Number.isFinite(selectedDiag.biasPct)?`${selectedDiag.biasPct>=0?'+':''}${selectedDiag.biasPct.toFixed(1)}%`:'—'} · Tracking ${Number.isFinite(selectedDiag.trackingSignal)?selectedDiag.trackingSignal.toFixed(2):'—'} · ความผันผวน ${percentText(forecastTrend.volatility)}`;
  const forecastAccuracyEl=document.getElementById('analytics-forecast-accuracy-table');
  if(forecastAccuracyEl)forecastAccuracyEl.innerHTML=forecastAccuracyTableHtml(forecastTrend.forecastModel);
  const analyticsDiag=document.getElementById('analytics-forecast-diagnostic-summary');if(analyticsDiag)analyticsDiag.innerHTML=forecastDiagnosticSummaryHtml(forecastTrend.forecastModel);
  const forecastFutureEl=document.getElementById('analytics-forecast-future-table');
  if(forecastFutureEl){
    const baseMonth=Number(forecastTrend.forecastBase?.month??forecastTrend.current?.month??0);
    const baseYear=Number(forecastTrend.forecastBase?.year??filter.year);
    const baseKey=forecastMonthKey(baseYear,baseMonth);
    const rows=forecastTrend.forecastModel.future.slice(0,6).map((value,index)=>{const d=forecastMonthFromKey(baseKey+index+1),band=forecastTrend.forecastModel.intervals[index]||{lower:value,upper:value};return{...d,value,lower:band.lower,upper:band.upper,p10:band.p10??band.lower,p50:band.p50??value,p90:band.p90??band.upper};});
    forecastFutureEl.innerHTML=`<div class="forecast-table-wrap"><table class="forecast-data-table"><thead><tr><th>เดือน</th><th>P10</th><th>P50 / Forecast</th><th>P90</th></tr></thead><tbody>${rows.map(row=>`<tr><td><b>${escapeHtml(forecastMonthLabel(row.year,row.month))}</b></td><td class="num">${chartMoney(row.lower)}</td><td class="num"><b>${chartMoney(row.value)}</b></td><td class="num">${chartMoney(row.upper)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  renderAnalyticsFunnel('analytics-funnel-chart',buildAnalyticsFunnel(kpis));
  const funnelSummary=document.getElementById('analytics-funnel-summary');
  if(funnelSummary)funnelSummary.innerHTML=`ช่องว่างค้างส่ง <b>${chartMoney(Math.max(0,kpis.deliveryGap))}</b> และค้างรับเงิน <b>${chartMoney(Math.max(0,kpis.uncollected))}</b> ใช้จัดลำดับการติดตามงานและเอกสารได้ทันที`;

  const priorSeries=analyticsMonthlySeries(filter.year-1,filter.branch,filter.agencyGroup,filter.agencyType);
  const monthlyCompareRows=series.map((row,index)=>{
    const prev=index===0?priorSeries[11]:series[index-1];
    const yoy=priorSeries[index]||{};
    return{...row,mom:dashComparePct(row.value,prev?.value),yoy:dashComparePct(row.value,yoy?.value),status:dashMonthlyStatus(row)};
  });
  analyticsRenderTable('analytics-monthly-table',[
    {label:'เดือน',html:r=>`<b>${escapeHtml(r.label)}</b>`},
    {label:'ยอดขาย',html:r=>chartMoney(r.value),cls:'num'},
    {label:'MoM',html:r=>`<span class="delta-pill ${dashCompareClass(r.mom)}">${dashComparePctText(r.mom)}</span>`,cls:'num'},
    {label:'YoY',html:r=>`<span class="delta-pill ${dashCompareClass(r.yoy)}">${dashComparePctText(r.yoy)}</span>`,cls:'num'},
    {label:'ส่งสินค้า',html:r=>chartMoney(r.delivery),cls:'num'},
    {label:'Delivery',html:r=>percentText(r.deliveryRate),cls:'num'},
    {label:'รับเงิน',html:r=>chartMoney(r.receipts),cls:'num'},
    {label:'Collection',html:r=>percentText(r.collectionRate),cls:'num'},
    {label:'กำไรสุทธิ',html:r=>chartMoney(r.profit),cls:'num'},
    {label:'Net Margin',html:r=>percentText(r.margin),cls:'num'},
    {label:'สถานะ',html:r=>`<span class="status-pill ${r.status.cls}">${r.status.label}</span>`},
    {label:'เอกสาร',html:r=>fmt(r.docs),cls:'num'}
  ],monthlyCompareRows.filter(r=>filter.month===''||r.month===filter.month));

  analyticsRenderTable('analytics-customer-table',[
    {label:'ลูกค้า',html:r=>`${escapeHtml(r.label)} <span class="analytics-badge">${r.abc}</span>`},
    {label:'ประเภทหน่วยงาน',html:r=>{const agency=customerAgencyForRecord(r.rows?.[0]||{customer:r.label});return `${escapeHtml(agency.customerAgencyTypeLabel)}<br><small>${escapeHtml(agency.customerAgencyGroupLabel)}</small>`;}},
    {label:'ยอดขาย',html:r=>chartMoney(r.sales),cls:'num'},
    {label:'ส่งสินค้า',html:r=>chartMoney(r.delivery),cls:'num'},
    {label:'ใบเสร็จ',html:r=>chartMoney(r.receipts),cls:'num'},
    {label:'กำไร',html:r=>chartMoney(r.profit),cls:'num'},
    {label:'Margin',html:r=>percentText(r.margin),cls:'num'},
    {label:'ค้างรับเงิน',html:r=>chartMoney(Math.max(0,r.uncollected)),cls:'num'},
    {label:'เอกสาร',html:r=>fmt(r.count),cls:'num'},
    {label:'ล่าสุด',html:r=>escapeHtml(r.lastDateText)}
  ],customerGroups.slice(0,20));

  const customerStrategyRows=buildCustomerBusinessStrategyRows(customerGroups);
  analyticsRenderTable('analytics-customer-strategy-table',[
    {label:'ลูกค้า',html:r=>`${escapeHtml(r.label)}<br><small>${escapeHtml(r.agency.customerAgencyGroupLabel)} / ${escapeHtml(r.agency.customerAgencyTypeLabel)}</small>`},
    {label:'Class',html:r=>`<span class="analytics-badge">${escapeHtml(r.abc)}</span>`},
    {label:'ยอดขาย',html:r=>chartMoney(r.sales),cls:'num'},
    {label:'ค้างส่ง',html:r=>chartMoney(Math.max(0,r.deliveryGap)),cls:'num'},
    {label:'ค้างรับ',html:r=>chartMoney(Math.max(0,r.uncollected)),cls:'num'},
    {label:'Margin',html:r=>percentText(r.margin),cls:'num'},
    {label:'ระดับติดตาม',html:r=>analyticsAttentionBadge(r.priorityScore>=60?'overdue':r.priorityScore>=35?'soon':'done',r.actionLevel)},
    {label:'คำแนะนำ',html:r=>escapeHtml(r.actionText)}
  ],customerStrategyRows.slice(0,25),'ยังไม่มีข้อมูลลูกค้าเพื่อจัดทำแผนติดตาม');
  const customerStrategySummary=document.getElementById('analytics-customer-strategy-summary');
  if(customerStrategySummary)customerStrategySummary.innerHTML=`Business Analytics จัดลำดับจากลูกค้ากลุ่ม A, ยอดค้างรับ, งานค้างส่ง และ Margin ต่ำ เพื่อให้ฝ่ายขายเลือกติดตามลูกค้าที่กระทบยอดขายและกระแสเงินสดก่อน`;

  analyticsRenderTable('analytics-agency-table',[
    {label:'กลุ่มหลัก',html:r=>escapeHtml(r.groupLabel)},
    {label:'ประเภทย่อย',html:r=>`${escapeHtml(r.typeLabel)}${r.prefix?`<br><small>คำย่อ: ${escapeHtml(r.prefix)}</small>`:''}`},
    {label:'ยอดขาย',html:r=>chartMoney(r.sales),cls:'num'},
    {label:'ส่งสินค้า',html:r=>chartMoney(r.delivery),cls:'num'},
    {label:'ใบเสร็จ',html:r=>chartMoney(r.receipts),cls:'num'},
    {label:'ค้างรับ',html:r=>chartMoney(Math.max(0,r.uncollected)),cls:'num'},
    {label:'กำไร',html:r=>chartMoney(r.profit),cls:'num'},
    {label:'Margin',html:r=>percentText(r.margin),cls:'num'},
    {label:'ลูกค้า',html:r=>fmt(r.customerCount),cls:'num'},
    {label:'เอกสาร',html:r=>fmt(r.count),cls:'num'}
  ],agencyRows.slice(0,20));
  const agencyExplain=document.getElementById('analytics-agency-explain');
  if(agencyExplain)agencyExplain.innerHTML='ระบบแยกประเภทจากช่องประเภทหน่วยงานในเอกสาร หรือเดาอัตโนมัติจากคำขึ้นต้นชื่อลูกค้า เช่น สอ., สกก., สมาคมฯ, รพ., รร., หจก., บจก. เพื่อใช้เปรียบเทียบกลุ่มราชการ โรงพยาบาล โรงเรียน และบริษัทเอกชนในมุมยอดขาย กำไร ลูกหนี้ และเครดิตการชำระ';

  analyticsRenderTable('analytics-product-table',[
    {label:'รหัส',html:r=>escapeHtml(r.productCode||'-')},
    {label:'สินค้า/งาน',html:r=>escapeHtml(r.label)},
    {label:'หมวดสินค้า',html:r=>escapeHtml(r.productCategory||'อื่น ๆ')},
    {label:'ยอดขาย',html:r=>chartMoney(r.value),cls:'num'},
    {label:'จำนวน',html:r=>`${fmt(r.qty)} ${escapeHtml(r.units||'')}`,cls:'num'},
    {label:'ราคาเฉลี่ย',html:r=>chartMoney(r.avgPrice),cls:'num'},
    {label:'ลูกค้า',html:r=>fmt(r.customerCount),cls:'num'},
    {label:'สัดส่วน',html:r=>percentText(r.contributionPercent),cls:'num'},
    {label:'รายการ',html:r=>fmt(r.count),cls:'num'}
  ],productGroups.slice(0,20));

  analyticsRenderTable('analytics-salesperson-table',[
    {label:'พนักงานขาย',html:r=>escapeHtml(r.label)},
    {label:'ยอดขาย',html:r=>chartMoney(r.sales),cls:'num'},
    {label:'กำไร',html:r=>chartMoney(r.profit),cls:'num'},
    {label:'Margin',html:r=>percentText(r.margin),cls:'num'},
    {label:'ค่าเฉลี่ย/เอกสาร',html:r=>chartMoney(r.avgOrder),cls:'num'},
    {label:'ลูกค้า',html:r=>fmt(r.customerCount),cls:'num'},
    {label:'เอกสาร',html:r=>fmt(r.count),cls:'num'}
  ],salespersonRows.slice(0,20));

  analyticsRenderTable('analytics-branch-table',[
    {label:'สาขา',html:r=>`${analyticsBranchBadge(r.branch)}<br><small>${escapeHtml(r.label)}</small>`},
    {label:'ยอดขาย',html:r=>chartMoney(r.sales),cls:'num'},
    {label:'ส่งสินค้า',html:r=>chartMoney(r.delivery),cls:'num'},
    {label:'ใบเสร็จ',html:r=>chartMoney(r.receipts),cls:'num'},
    {label:'กำไรสุทธิ',html:r=>chartMoney(r.profit),cls:'num'},
    {label:'Net Margin',html:r=>percentText(r.netMargin),cls:'num'},
    {label:'Data Docs',html:r=>fmt(r.docs),cls:'num'}
  ],branchRows,'ยังไม่มีข้อมูลสาขา',{rowClass:analyticsBranchRowClass});

  analyticsRenderTable('analytics-ar-table',[
    {label:'สาขา',html:r=>analyticsBranchBadge(r.branch)},
    {label:'ใบส่งสินค้า / ใบกำกับภาษี',html:r=>escapeHtml(r.docNo)},
    {label:'ลูกค้า',html:r=>escapeHtml(r.customer)},
    {label:'เครดิต',html:r=>escapeHtml(r.creditTerm)},
    {label:'ครบกำหนด',html:r=>escapeHtml(r.dueText)},
    {label:'สถานะ',html:r=>analyticsAttentionBadge(r.state,r.bucket)},
    {label:'ยอดส่งสินค้า',html:r=>chartMoney(r.delivery),cls:'num'},
    {label:'รับแล้ว',html:r=>chartMoney(r.paid),cls:'num'},
    {label:'ค้างรับ',html:r=>chartMoney(r.outstanding),cls:'num'}
  ],arRows.filter(r=>r.outstanding>0).slice(0,25),'ยังไม่พบลูกหนี้ค้างรับในช่วงที่เลือก',{rowClass:analyticsBranchRowClass});
  const arSummary=document.getElementById('analytics-ar-summary');
  if(arSummary)arSummary.innerHTML=`ค้างรับรวม <b>${chartMoney(arRows.reduce((s,r)=>s+r.outstanding,0))}</b> จาก ${arRows.filter(r=>r.outstanding>0).length} บิล · ใช้จัดลำดับการติดตามเครดิตลูกค้า`;

  analyticsRenderTable('analytics-delivery-control-table',[
    {label:'สาขา',html:r=>analyticsBranchBadge(r.branch)},
    {label:'ใบสั่งผลิต',html:r=>escapeHtml(r.productionNo)},
    {label:'ลูกค้า / งาน',html:r=>`${escapeHtml(r.customer)}<br><small>${escapeHtml(r.job)}</small>`},
    {label:'ระยะเวลา',html:r=>escapeHtml(r.lead)},
    {label:'กำหนดส่ง',html:r=>escapeHtml(r.dueText)},
    {label:'สถานะ',html:r=>analyticsAttentionBadge(r.state,r.text)},
    {label:'ใบส่งสินค้า / ใบกำกับภาษี',html:r=>r.invoiceNo?escapeHtml(r.invoiceNo):'-'},
    {label:'มูลค่างาน',html:r=>chartMoney(r.amount),cls:'num'}
  ],deliveryControlRows.filter(r=>r.state!=='done').slice(0,25),'ยังไม่พบงานค้างส่งในช่วงที่เลือก',{rowClass:analyticsBranchRowClass});
  const deliveryControlSummary=document.getElementById('analytics-delivery-control-summary');
  if(deliveryControlSummary)deliveryControlSummary.innerHTML=`งานเลยกำหนด <b>${deliveryControlRows.filter(r=>r.state==='overdue').length}</b> รายการ · งานใกล้ครบกำหนด/ครบวันนี้ <b>${deliveryControlRows.filter(r=>r.state==='soon'||r.state==='dueToday').length}</b> รายการ`;

  analyticsRenderTable('analytics-supplier-payable-table',[
    {label:'สาขา',html:r=>analyticsBranchBadge(r.branch)},
    {label:'ใบสั่งผลิต',html:r=>escapeHtml(r.productionNo)},
    {label:'ผู้ผลิต',html:r=>escapeHtml(r.maker)},
    {label:'เครดิตผู้ผลิต',html:r=>`${escapeHtml(r.credit)}<br><small>ระยะส่ง: ${escapeHtml(r.lead)}</small>`},
    {label:'ครบกำหนดจ่าย',html:r=>escapeHtml(r.dueText)},
    {label:'สถานะ',html:r=>analyticsAttentionBadge(r.state,r.text)},
    {label:'ยอดต้นทุน',html:r=>chartMoney(r.amount),cls:'num'}
  ],supplierPayableRows.filter(r=>r.state!=='paid').slice(0,25),'ยังไม่พบรายการค้างชำระผู้ผลิตในช่วงที่เลือก',{rowClass:analyticsBranchRowClass});
  const supplierPayableSummary=document.getElementById('analytics-supplier-payable-summary');
  if(supplierPayableSummary)supplierPayableSummary.innerHTML=`ยอดที่ยังไม่ชำระผู้ผลิตในรายการที่แสดง <b>${chartMoney(supplierPayableRows.filter(r=>r.state!=='paid').reduce((s,r)=>s+r.amount,0))}</b> · ค่าเริ่มต้นเครดิตผู้ผลิตอิงระยะเวลาส่งสินค้า`;

  analyticsRenderTable('analytics-risk-table',[
    {label:'สาขา',html:r=>analyticsBranchBadge(r.branch)},
    {label:'ประเภท',html:r=>escapeHtml(r.type)},
    {label:'เลขเอกสาร',html:r=>escapeHtml(r.docNo)},
    {label:'ลูกค้า',html:r=>escapeHtml(r.customer)},
    {label:'วันที่',html:r=>escapeHtml(r.date)},
    {label:'สิ่งที่ควรตรวจ',html:r=>escapeHtml(r.reason)}
  ],quality.samples,'ยังไม่พบตัวอย่างข้อมูลที่ควรตรวจในช่วงที่เลือก',{rowClass:analyticsBranchRowClass});
  renderQuantBusinessAnalytics(filter,data,kpis,customerGroups,productGroups,arRows,forecastTrend);
  renderAnalyticsExplainPanel();
}
async function refreshDataAnalytics(force=false){
  const filter=analyticsFilters();
  if(force){await syncFromFirebaseYear?.(filter.year,{force:true}).catch(err=>console.warn('refresh analytics sync failed:',err));}
  renderDataAnalytics();
}


// ============================================================
// QUANT BUSINESS INTELLIGENCE LAYER
// Explainable risk/probability metrics built on existing ERP data.
// - CV = sample standard deviation / mean
// - HHI = sum of squared revenue shares (percentage points)
// - Modified Z = 0.6745 * (x - median) / MAD
// - Monte Carlo uses normal errors scaled by rolling-origin CV RMSE
// ============================================================
function quantClamp(value,min=0,max=100){return Math.max(min,Math.min(max,safeNum(value)));}
function quantMean(values=[]){const v=values.filter(x=>Number.isFinite(Number(x))).map(Number);return v.length?v.reduce((s,x)=>s+x,0)/v.length:0;}
function quantSampleSd(values=[]){const v=values.filter(x=>Number.isFinite(Number(x))).map(Number);if(v.length<2)return 0;const m=quantMean(v);return Math.sqrt(v.reduce((s,x)=>s+(x-m)**2,0)/(v.length-1));}
function quantCv(values=[]){const m=quantMean(values);return m>0?quantSampleSd(values)/m*100:0;}
function quantMedian(values=[]){const v=values.filter(x=>Number.isFinite(Number(x))).map(Number).sort((a,b)=>a-b);if(!v.length)return 0;const i=Math.floor(v.length/2);return v.length%2?v[i]:(v[i-1]+v[i])/2;}
function quantMad(values=[]){const med=quantMedian(values);return quantMedian(values.map(x=>Math.abs(safeNum(x)-med)));}
function quantModifiedZ(value,values=[]){const med=quantMedian(values),mad=quantMad(values);if(!mad)return 0;return .6745*(safeNum(value)-med)/mad;}
function quantRevenueAnomalies(series=[]){
  const active=(series||[]).filter(r=>safeNum(r.value)>0);const vals=active.map(r=>safeNum(r.value));
  if(vals.length<5)return[];
  return active.map(r=>({...r,modifiedZ:quantModifiedZ(r.value,vals)})).filter(r=>Math.abs(r.modifiedZ)>3.5).sort((a,b)=>Math.abs(b.modifiedZ)-Math.abs(a.modifiedZ));
}
function quantMaxDrawdown(values=[]){
  let peak=0,maxDd=0,peakValue=0,troughValue=0;
  values.map(v=>Math.max(0,safeNum(v))).forEach(v=>{if(v>peak)peak=v;if(peak>0){const dd=(peak-v)/peak*100;if(dd>maxDd){maxDd=dd;peakValue=peak;troughValue=v;}}});
  return{percent:maxDd,peak:peakValue,trough:troughValue};
}
function quantHhi(rows=[],valueKey='sales'){
  const values=rows.map(r=>Math.max(0,safeNum(r[valueKey]??r.value))).filter(v=>v>0);const total=values.reduce((s,v)=>s+v,0);
  if(!total)return{hhi:0,top1:0,top5:0,total:0,label:'ยังไม่มีข้อมูล',cls:'muted'};
  const shares=values.map(v=>v/total*100).sort((a,b)=>b-a);const hhi=shares.reduce((s,p)=>s+p*p,0);const top5=shares.slice(0,5).reduce((s,p)=>s+p,0);
  let label='กระจายตัวดี',cls='good';if(hhi>1800){label='กระจุกตัวสูง';cls='danger';}else if(hhi>=1000){label='กระจุกตัวปานกลาง';cls='warn';}
  return{hhi,top1:shares[0]||0,top5,total,label,cls};
}
function quantBusinessRegime(series=[]){
  const vals=(series||[]).map(r=>safeNum(r.value)).filter(v=>v>0);if(vals.length<4)return{label:'ข้อมูลไม่พอ',cls:'muted',momentum:0,slope:0,detail:'ควรมีอย่างน้อย 4 เดือน'};
  const recent=vals.slice(-Math.min(3,vals.length));const prior=vals.slice(-Math.min(6,vals.length),-3);const r=quantMean(recent),p=prior.length?quantMean(prior):vals.at(-2);
  const momentum=p?((r-p)/p)*100:0;const lr=forecastLinearFit(vals.slice(-Math.min(6,vals.length)),1);const slopePct=r?lr.slope/r*100:0;
  if(momentum>=10&&slopePct>0)return{label:'Strong Growth',cls:'good',momentum,slope:slopePct,detail:'ยอดเฉลี่ย 3 เดือนล่าสุดเร่งตัวชัดเจน'};
  if(momentum>=2)return{label:'Growth',cls:'good',momentum,slope:slopePct,detail:'ยอดเฉลี่ยระยะสั้นสูงกว่าช่วงก่อน'};
  if(momentum<=-10)return{label:'Contraction',cls:'danger',momentum,slope:slopePct,detail:'ยอดเฉลี่ยระยะสั้นหดตัวมากกว่า 10%'};
  if(momentum<=-2)return{label:'Slowdown',cls:'warn',momentum,slope:slopePct,detail:'ยอดเฉลี่ยระยะสั้นเริ่มชะลอลง'};
  return{label:'Stable',cls:'neutral',momentum,slope:slopePct,detail:'ยอดระยะสั้นยังอยู่ในช่วงค่อนข้างทรงตัว'};
}
function quantHistoricalQuoteApproval(year,month,branches=dashBranches(),lookback=24){
  const targetKey=forecastMonthKey(Number(year),Number(month));let approved=0,total=0;
  for(let offset=lookback;offset>=1;offset--){const d=forecastMonthFromKey(targetKey-offset);branches.forEach(br=>{const data=loadFor(br,d.year,d.month);(data.quotes||[]).forEach(q=>{total+=1;if(q.approved)approved+=1;});});}
  // Add-one/Laplace smoothing only when history is sufficiently populated. Otherwise retain the former conservative fallback.
  const probability=total>=5?(approved+1)/(total+2):.35;
  return{approved,total,probability,source:total>=5?'history':'fallback'};
}
function quantQuoteProbabilityModel(filter={}){
  const endMonth=filter.month===''?11:Number(filter.month||0),branches=analyticsBranchList(filter.branch),endKey=forecastMonthKey(filter.year,endMonth);const stats={overall:{wins:0,n:0},groups:new Map()};
  for(let off=24;off>=1;off--){const d=forecastMonthFromKey(endKey-off);branches.forEach(br=>{const data=loadFor(br,d.year,d.month);(data.quotes||[]).forEach(raw=>{const q=withCustomerAgencyMeta(raw);stats.overall.n++;if(q.approved)stats.overall.wins++;const g=q.customerAgencyGroup||'other',cur=stats.groups.get(g)||{wins:0,n:0};cur.n++;if(q.approved)cur.wins++;stats.groups.set(g,cur);});});}
  const smooth=s=>s.n>=5?(s.wins+1)/(s.n+2):null;const overall=smooth(stats.overall)??.35;
  return{...stats,overallProbability:overall,probabilityFor(q){const g=withCustomerAgencyMeta(q).customerAgencyGroup||'other',s=stats.groups.get(g);return smooth(s||{wins:0,n:0})??overall;}};
}
function quantSeed(text=''){let h=2166136261>>>0;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function quantRng(seed){let s=seed>>>0;return()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return(s+1)/4294967297;};}
function quantNormal(rng){let u=0,v=0;while(u<=Number.EPSILON)u=rng();while(v<=Number.EPSILON)v=rng();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function quantMonteCarlo(base,sigma,target=0,n=5000,seedText='quant'){
  const rng=quantRng(quantSeed(seedText)),vals=[];let hit=0;const sd=Math.max(0,safeNum(sigma)),center=Math.max(0,safeNum(base));
  for(let i=0;i<n;i++){const x=Math.max(0,center+sd*quantNormal(rng));vals.push(x);if(target>0&&x>=target)hit++;}
  vals.sort((a,b)=>a-b);const q=p=>vals[Math.min(vals.length-1,Math.max(0,Math.floor((vals.length-1)*p)))]||0;
  const p05=q(.05),p10=q(.10),p50=q(.50),p90=q(.90),p95=q(.95),mean=quantMean(vals),simSd=quantSampleSd(vals);
  const tailCount=Math.max(1,Math.floor(vals.length*.10));const downsideTailMean=quantMean(vals.slice(0,tailCount));
  const revenueAtRisk=Math.max(0,center-p10);
  const targetProbability=target>0?hit/n*100:null;
  const targetShortfallProbability=target>0?100-targetProbability:null;
  const expectedTargetGap=target>0?vals.reduce((s,x)=>s+Math.max(0,target-x),0)/vals.length:null;
  return{n,p05,p10,p50,p90,p95,mean,sd:simSd,downsideTailMean,revenueAtRisk,targetProbability,targetShortfallProbability,expectedTargetGap};
}
function quantRiskPill(label,cls='neutral'){return `<span class="quant-risk-pill ${cls}">${escapeHtml(label)}</span>`;}
function quantKpi(label,value,detail,cls='neutral'){return `<div class="quant-kpi ${cls}"><small>${escapeHtml(label)}</small><b>${value}</b><span>${detail||''}</span></div>`;}
function quantCompositeRiskScore({cv=0,hhi=0,drawdown=0,overdueRate=0,wape=0,trackingSignal=0}={}){
  const parts={
    volatility:quantClamp(cv/50*100),
    concentration:quantClamp(hhi/2500*100),
    drawdown:quantClamp(drawdown/50*100),
    collection:quantClamp(overdueRate/40*100),
    forecast:quantClamp(wape/50*85+Math.min(15,Math.abs(trackingSignal)*3.75))
  };
  const score=parts.volatility*.20+parts.concentration*.20+parts.drawdown*.20+parts.collection*.20+parts.forecast*.20;
  const rounded=Math.round(score);let label='Low Risk',cls='good';if(rounded>=65){label='High Risk';cls='danger';}else if(rounded>=35){label='Moderate Risk';cls='warn';}
  return{score:rounded,label,cls,parts};
}
function quantDecisionStatus(label,cls='neutral',detail=''){return{label,cls,detail};}
function quantForecastDecision(selected={}){
  if(!selected?.eligible)return quantDecisionStatus('ข้อมูลไม่พอ','muted','เพิ่มข้อมูลย้อนหลังเพื่อประเมินโมเดล');
  if(Math.abs(safeNum(selected.trackingSignal))>=4)return quantDecisionStatus('Bias Alert','danger',selected.trackingSignal>0?'Forecast ต่ำกว่ายอดจริงต่อเนื่อง':'Forecast สูงกว่ายอดจริงต่อเนื่อง');
  if(safeNum(selected.wape)>35)return quantDecisionStatus('Accuracy Risk','warn','WAPE สูง ควรดู P10/P50/P90 มากกว่าค่าจุดเดียว');
  if(safeNum(selected.wape)<=20&&Math.abs(safeNum(selected.biasPct))<10)return quantDecisionStatus('Healthy','good','ความคลาดเคลื่อนและ Bias อยู่ในกรอบที่อ่านง่าย');
  return quantDecisionStatus('Monitor','neutral','ติดตามผลจริงเทียบ Forecast ทุกเดือน');
}
function quantDecisionTableRows({selected,cv,hhi,drawdown,overdueRate,mc,target}={}){
  const forecastDecision=quantForecastDecision(selected||{});
  const targetProb=mc?.targetProbability;
  return[
    {metric:'Forecast Accuracy',value:selected?.eligible?`${safeNum(selected.wape).toFixed(1)}% WAPE`:'—',status:forecastDecision.label,cls:forecastDecision.cls,action:forecastDecision.detail},
    {metric:'Forecast Bias',value:selected?.eligible?`${safeNum(selected.biasPct)>=0?'+':''}${safeNum(selected.biasPct).toFixed(1)}% · TS ${safeNum(selected.trackingSignal).toFixed(2)}`:'—',status:Math.abs(safeNum(selected?.trackingSignal))>=4?'Bias Alert':'In Control',cls:Math.abs(safeNum(selected?.trackingSignal))>=4?'danger':'good',action:Math.abs(safeNum(selected?.trackingSignal))>=4?'ทบทวนโมเดลหรือปรับ Forecast ก่อนใช้วางแผน':'ยังไม่พบ Bias ต่อเนื่องเด่นชัด'},
    {metric:'Revenue Volatility',value:`${safeNum(cv).toFixed(1)}% CV`,status:cv>35?'High':cv>20?'Medium':'Low',cls:cv>35?'danger':cv>20?'warn':'good',action:cv>35?'ใช้ Scenario และกัน Safety Buffer เพิ่ม':'ใช้ Base Forecast ร่วมกับช่วง P10–P90'},
    {metric:'Customer Concentration',value:`HHI ${safeNum(hhi).toFixed(0)}`,status:hhi>1800?'High':hhi>=1000?'Medium':'Low',cls:hhi>1800?'danger':hhi>=1000?'warn':'good',action:hhi>1800?'ลดการพึ่งลูกค้ากลุ่มใหญ่และเพิ่มฐานลูกค้า':'ติดตาม Top customer share ต่อเนื่อง'},
    {metric:'Peak-to-Trough',value:`-${safeNum(drawdown).toFixed(1)}%`,status:drawdown>35?'Severe':drawdown>20?'Watch':'Normal',cls:drawdown>35?'danger':drawdown>20?'warn':'good',action:drawdown>20?'ตรวจสาเหตุยอดขายลดและ Recovery Plan':'ยังไม่พบ Drawdown สูงผิดปกติ'},
    {metric:'Overdue Exposure',value:`${safeNum(overdueRate).toFixed(1)}%`,status:overdueRate>30?'High':overdueRate>10?'Watch':'Healthy',cls:overdueRate>30?'danger':overdueRate>10?'warn':'good',action:overdueRate>10?'เร่งติดตามลูกหนี้และวางแผน Cash Flow':'Cash collection อยู่ในกรอบที่ดี'},
    {metric:'Target Probability',value:target>0&&targetProb!==null?`${targetProb.toFixed(1)}%`:'ยังไม่ตั้งเป้า',status:target<=0?'N/A':targetProb>=70?'Strong':targetProb>=40?'Uncertain':'Low',cls:target<=0?'muted':targetProb>=70?'good':targetProb>=40?'warn':'danger',action:target<=0?'ตั้งเป้ายอดขายเพื่อใช้ Probability':targetProb<40?'เพิ่ม Pipeline หรือปรับแผนยอดขาย':targetProb<70?'ติดตาม Pipeline รายสัปดาห์':'โอกาสถึงเป้าอยู่ในระดับดี'}
  ];
}
function quantDecisionTableHtml(rows=[]){
  return `<div class="forecast-table-wrap"><table class="forecast-data-table quant-decision-table"><thead><tr><th>ตัวชี้วัด</th><th>ค่าปัจจุบัน</th><th>สถานะ</th><th>แนวทางตัดสินใจ</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${escapeHtml(r.metric)}</b></td><td class="num">${escapeHtml(r.value)}</td><td>${quantRiskPill(r.status,r.cls)}</td><td>${escapeHtml(r.action)}</td></tr>`).join('')}</tbody></table></div>`;
}
function quantDashboardData(){
  const year=parseInt(document.getElementById('dash-year')?.value||now.getFullYear()),m=parseInt(document.getElementById('dash-month')?.value??-1),branch=dashTab==='all'?'':dashTab;
  const filter={year,month:m===-1?'':m,branch,agencyGroup:'',agencyType:'',product:'',focus:'sales',forecastMethod:document.getElementById('forecast-method')?.value||'auto'};
  const data=collectAnalyticsData(filter),customers=buildCustomerDeepRows(data),products=buildProductDeepRows(data),ar=buildReceivableAgingRows(data);return{filter,data,customers,products,ar,kpis:buildAnalyticsKpis(data,filter)};
}
function renderQuantDashboard(){
  const host=document.getElementById('quant-dashboard-kpis');if(!host)return;
  const f=buildSalesForecast(),qd=quantDashboardData();
  const series=[];const refKey=forecastMonthKey(f.ref.year,f.ref.month);
  for(let off=11;off>=0;off--){const d=forecastMonthFromKey(refKey-off);series.push({...d,value:forecastSalesForMonth(d.year,d.month,f.branches)});}
  const active=series.filter(r=>r.value>0),cv=quantCv(active.map(r=>r.value)),regime=quantBusinessRegime(active),conc=quantHhi(qd.customers,'sales'),draw=quantMaxDrawdown(active.map(r=>r.value));
  const arTotal=qd.ar.reduce((s,r)=>s+r.outstanding,0),overdue=qd.ar.filter(r=>r.state==='overdue').reduce((s,r)=>s+r.outstanding,0),overdueRate=ratioPercent(overdue,arTotal),anomalies=quantRevenueAnomalies(active);
  const selected=f.model?.candidates?.find(r=>r.id===f.model.selectedId)||f.model?.cv||{};
  const riskScore=quantCompositeRiskScore({cv,hhi:conc.hhi,drawdown:draw.percent,overdueRate,wape:safeNum(selected.wape),trackingSignal:safeNum(selected.trackingSignal)});
  host.innerHTML=
    quantKpi('Composite Risk Score',`${riskScore.score}/100`,`${riskScore.label} · Internal heuristic 5 ด้าน`,riskScore.cls)+
    quantKpi('Business Regime',quantRiskPill(regime.label,regime.cls),`3M Momentum ${forecastPercent(regime.momentum)}`,regime.cls)+
    quantKpi('Revenue Volatility',`${cv.toFixed(1)}%`,`CV จากยอดขายรายเดือน 12 เดือน`,cv>35?'danger':cv>20?'warn':'good')+
    quantKpi('Customer HHI',conc.hhi.toFixed(0),`${conc.label} · Top 5 ${conc.top5.toFixed(1)}%`,conc.cls)+
    quantKpi('Peak-to-Trough Decline',`-${draw.percent.toFixed(1)}%`,`จุดสูง ${chartMoney(draw.peak)} → ต่ำ ${chartMoney(draw.trough)}`,draw.percent>35?'danger':draw.percent>20?'warn':'neutral')+
    quantKpi('Forecast Bias',selected?.eligible?`${safeNum(selected.biasPct)>=0?'+':''}${safeNum(selected.biasPct).toFixed(1)}%`:'—',selected?.eligible?`Tracking Signal ${safeNum(selected.trackingSignal).toFixed(2)} · WAPE ${safeNum(selected.wape).toFixed(1)}%`:'ข้อมูล CV ยังไม่พอ',Math.abs(safeNum(selected?.trackingSignal))>=4?'danger':Math.abs(safeNum(selected?.biasPct))>=10?'warn':'good')+
    quantKpi('Overdue Exposure',`${overdueRate.toFixed(1)}%`,`ค้างเกินกำหนด ${chartMoney(overdue)} / AR ${chartMoney(arTotal)}`,overdueRate>30?'danger':overdueRate>10?'warn':'good')+
    quantKpi('Robust Anomaly',`${anomalies.length} เดือน`,`Modified Z-score |M| > 3.5`,anomalies.length?'warn':'good');

  const target=currentSalesTarget(),sigma=Number.isFinite(f.model.cv.rmse)?f.model.cv.rmse:quantSampleSd(active.map(r=>r.value)),mc=quantMonteCarlo(f.next,sigma,target,5000,`${f.ref.year}-${f.ref.month}-${f.model.selectedId}-${f.next}`);
  const monte=document.getElementById('quant-dashboard-montecarlo');
  if(monte)monte.innerHTML=`<div class="quant-mc-main"><div><small>P50 / Median Scenario</small><strong>${chartMoney(mc.p50)}</strong><span>${escapeHtml(forecastMonthLabel(f.future[0]?.year||f.ref.year,f.future[0]?.month??f.ref.month))}</span></div><div class="quant-prob-ring ${mc.targetProbability===null?'muted':mc.targetProbability>=70?'good':mc.targetProbability>=40?'warn':'danger'}"><b>${mc.targetProbability===null?'—':mc.targetProbability.toFixed(1)+'%'}</b><span>โอกาสถึงเป้า</span></div></div><div class="quant-quantiles"><div><span>P10</span><b>${chartMoney(mc.p10)}</b></div><div><span>P50</span><b>${chartMoney(mc.p50)}</b></div><div><span>P90</span><b>${chartMoney(mc.p90)}</b></div></div><p class="quant-help">จำลอง ${mc.n.toLocaleString('th-TH')} สถานการณ์จาก Base Forecast และ CV RMSE${target>0?` · เป้าหมาย ${chartMoney(target)}`:' · ยังไม่ได้ตั้งเป้ายอดขายสำหรับมุมมองนี้'}</p>`;
  const tail=document.getElementById('quant-dashboard-tailrisk');
  if(tail)tail.innerHTML=`<div class="quant-tail-grid"><div><small>Revenue-at-Risk (P10)</small><b>${chartMoney(mc.revenueAtRisk)}</b><span>ส่วนต่าง Base ถึง P10</span></div><div><small>Downside Tail Mean</small><b>${chartMoney(mc.downsideTailMean)}</b><span>ค่าเฉลี่ย 10% สถานการณ์แย่สุด</span></div><div><small>Target Shortfall</small><b>${mc.targetShortfallProbability===null?'—':mc.targetShortfallProbability.toFixed(1)+'%'}</b><span>${target>0?'ความน่าจะเป็นที่ต่ำกว่าเป้า':'ยังไม่ได้ตั้งเป้า'}</span></div><div><small>Expected Target Gap</small><b>${mc.expectedTargetGap===null?'—':chartMoney(mc.expectedTargetGap)}</b><span>ส่วนขาดเป้าเฉลี่ยจากทุก Scenario</span></div></div>`;

  const risk=document.getElementById('quant-dashboard-risklist');
  if(risk){
    const items=[
      {title:'Composite risk',value:`${riskScore.score}/100 · ${riskScore.label}`,detail:'Volatility + Concentration + Drawdown + Collection + Forecast',cls:riskScore.cls},
      {title:'Forecast governance',value:selected?.eligible?`${safeNum(selected.wape).toFixed(1)}% WAPE`:'ข้อมูลไม่พอ',detail:selected?.eligible?`Bias ${safeNum(selected.biasPct)>=0?'+':''}${safeNum(selected.biasPct).toFixed(1)}% · Tracking ${safeNum(selected.trackingSignal).toFixed(2)}`:'ต้องมีรอบ Cross-validation เพิ่ม',cls:quantForecastDecision(selected).cls},
      {title:'Revenue regime',value:regime.label,detail:regime.detail,cls:regime.cls},
      {title:'Customer concentration',value:`HHI ${conc.hhi.toFixed(0)}`,detail:`Top customer ${conc.top1.toFixed(1)}% · Top 5 ${conc.top5.toFixed(1)}%`,cls:conc.cls},
      {title:'Collection risk',value:`${overdueRate.toFixed(1)}% overdue exposure`,detail:`ยอดเกินกำหนด ${chartMoney(overdue)}`,cls:overdueRate>30?'danger':overdueRate>10?'warn':'good'},
      {title:'Revenue anomalies',value:`${anomalies.length} จุด`,detail:anomalies.length?anomalies.map(x=>`${MONTHS[x.month]} M=${x.modifiedZ.toFixed(1)}`).join(' · '):'ไม่พบเดือนที่เกินเกณฑ์ Modified Z-score 3.5',cls:anomalies.length?'warn':'good'}
    ];
    risk.innerHTML=items.map(x=>`<div class="quant-signal ${x.cls}"><div><b>${escapeHtml(x.title)}</b><span>${escapeHtml(x.detail)}</span></div><strong>${escapeHtml(x.value)}</strong></div>`).join('');
  }
  const decisionRows=quantDecisionTableRows({selected,cv,hhi:conc.hhi,drawdown:draw.percent,overdueRate,mc,target});
  const decision=document.getElementById('quant-dashboard-decision-table');if(decision)decision.innerHTML=quantDecisionTableHtml(decisionRows);
  const decisionSummary=document.getElementById('quant-dashboard-decision-summary');if(decisionSummary)decisionSummary.innerHTML=`<b>Quant Decision:</b> ${riskScore.label} (${riskScore.score}/100) · ${escapeHtml(quantForecastDecision(selected).detail)}${target>0?` · โอกาสถึงเป้า ${mc.targetProbability?.toFixed?.(1)??'—'}%`:''} · Score นี้เป็น Internal Heuristic เพื่อจัดลำดับความเสี่ยง ไม่ใช่คะแนนมาตรฐานทางการเงิน`;
}
function quantCustomerConcentrationRows(customerGroups=[]){const total=customerGroups.reduce((s,r)=>s+safeNum(r.sales),0);return customerGroups.map((r,i)=>({...r,rank:i+1,share:total?safeNum(r.sales)/total*100:0}));}
function renderQuantBusinessAnalytics(filter,data,kpis,customerGroups,productGroups,arRows,forecastTrend){
  const host=document.getElementById('quant-analytics-kpis');if(!host)return;
  const hist=analyticsForecastHistorySeries(filter.year,filter.branch,filter.agencyGroup,filter.agencyType,filter.month);
  const active=hist.filter(r=>safeNum(r.value)>0),cv=quantCv(active.map(r=>r.value)),regime=quantBusinessRegime(active),cHhi=quantHhi(customerGroups,'sales'),pHhi=quantHhi(productGroups,'value'),draw=quantMaxDrawdown(active.map(r=>r.value)),anomalies=quantRevenueAnomalies(active);
  const arTotal=arRows.reduce((s,r)=>s+r.outstanding,0),overdue=arRows.filter(r=>r.state==='overdue').reduce((s,r)=>s+r.outstanding,0),overdueRate=ratioPercent(overdue,arTotal);
  const selected=forecastTrend.forecastModel?.candidates?.find(r=>r.id===forecastTrend.forecastModel.selectedId)||forecastTrend.forecastModel?.cv||{};
  const riskScore=quantCompositeRiskScore({cv,hhi:cHhi.hhi,drawdown:draw.percent,overdueRate,wape:safeNum(selected.wape),trackingSignal:safeNum(selected.trackingSignal)});
  host.innerHTML=
    quantKpi('Composite Risk',`${riskScore.score}/100`,`${riskScore.label} · Internal heuristic`,riskScore.cls)+
    quantKpi('Revenue CV',`${cv.toFixed(1)}%`,'Sample SD ÷ Mean',cv>35?'danger':cv>20?'warn':'good')+
    quantKpi('Forecast WAPE',selected?.eligible?`${safeNum(selected.wape).toFixed(1)}%`:'—',selected?.eligible?`Bias ${safeNum(selected.biasPct)>=0?'+':''}${safeNum(selected.biasPct).toFixed(1)}% · TS ${safeNum(selected.trackingSignal).toFixed(2)}`:'ข้อมูล CV ยังไม่พอ',quantForecastDecision(selected).cls)+
    quantKpi('Customer HHI',cHhi.hhi.toFixed(0),`${cHhi.label} · Top 5 ${cHhi.top5.toFixed(1)}%`,cHhi.cls)+
    quantKpi('Product HHI',pHhi.hhi.toFixed(0),`${pHhi.label} · Top 5 ${pHhi.top5.toFixed(1)}%`,pHhi.cls)+
    quantKpi('Max Sales Decline',`-${draw.percent.toFixed(1)}%`,'Peak-to-trough',draw.percent>35?'danger':draw.percent>20?'warn':'neutral')+
    quantKpi('Overdue Exposure',`${overdueRate.toFixed(1)}%`,`${chartMoney(overdue)} จาก AR ${chartMoney(arTotal)}`,overdueRate>30?'danger':overdueRate>10?'warn':'good')+
    quantKpi('Anomaly Count',String(anomalies.length),'Modified Z-score > 3.5',anomalies.length?'warn':'good');

  const regimeEl=document.getElementById('quant-regime-card');
  if(regimeEl)regimeEl.innerHTML=`<div class="quant-regime ${regime.cls}"><div class="quant-regime-badge">${escapeHtml(regime.label)}</div><div><b>Momentum 3 เดือน ${forecastPercent(regime.momentum)}</b><span>${escapeHtml(regime.detail)}</span><small>Linear slope ระยะสั้น ${forecastPercent(regime.slope)} ต่อระดับยอดเฉลี่ย · Risk Score ${riskScore.score}/100</small></div></div>`;

  const quoteModel=quantQuoteProbabilityModel(filter);
  const pending=(data.quotes||[]).filter(q=>!q.approved).map(q=>{
    const p=quoteModel.probabilityFor(q),value=analyticsSalesValue({...q,_type:'quotes'}),expected=value*p,unconverted=Math.max(0,value-expected);
    const band=p>=.65?'สูง':p>=.40?'กลาง':'ต่ำ',cls=p>=.65?'good':p>=.40?'warn':'danger';
    return{no:analyticsDocNo(q)||'-',customer:analyticsCustomer(q),agency:customerAgencyForRecord(q).customerAgencyGroupLabel,value,probability:p,expected,unconverted,band,cls};
  }).sort((a,b)=>b.expected-a.expected);
  analyticsRenderTable('quant-pipeline-table',[
    {label:'ใบเสนอราคา',html:r=>escapeHtml(r.no)},
    {label:'ลูกค้า',html:r=>`${escapeHtml(r.customer)}<br><small>${escapeHtml(r.agency)}</small>`},
    {label:'มูลค่า',html:r=>chartMoney(r.value),cls:'num'},
    {label:'Approval Proxy',html:r=>`<span class="quant-proxy-pill">${(r.probability*100).toFixed(1)}%</span>`,cls:'num'},
    {label:'Band',html:r=>quantRiskPill(r.band,r.cls)},
    {label:'Expected Pipeline',html:r=>chartMoney(r.expected),cls:'num'},
    {label:'Unconverted Exposure',html:r=>chartMoney(r.unconverted),cls:'num'}
  ],pending.slice(0,25),'ไม่มีใบเสนอราคาที่รออนุมัติในช่วงที่เลือก');
  const pipelineTotal=pending.reduce((s,r)=>s+r.value,0),pipelineExpected=pending.reduce((s,r)=>s+r.expected,0),pipelineExposure=pending.reduce((s,r)=>s+r.unconverted,0);
  const ps=document.getElementById('quant-pipeline-summary');if(ps)ps.innerHTML=`Open Pipeline <b>${chartMoney(pipelineTotal)}</b> · Expected Pipeline <b>${chartMoney(pipelineExpected)}</b> · Unconverted Exposure <b>${chartMoney(pipelineExposure)}</b> · Overall approval proxy ${(quoteModel.overallProbability*100).toFixed(1)}% จากประวัติ ${quoteModel.overall.n} ใบ`;

  const concRows=quantCustomerConcentrationRows(customerGroups).map(r=>({...r,hhiContribution:r.share*r.share,risk:r.share>=25?'สูง':r.share>=15?'กลาง':'ปกติ'}));
  analyticsRenderTable('quant-concentration-table',[
    {label:'#',html:r=>String(r.rank),cls:'num'},
    {label:'ลูกค้า',html:r=>escapeHtml(r.label)},
    {label:'ยอดขาย',html:r=>chartMoney(r.sales),cls:'num'},
    {label:'Share',html:r=>`${r.share.toFixed(1)}%`,cls:'num'},
    {label:'HHI Contribution',html:r=>r.hhiContribution.toFixed(0),cls:'num'},
    {label:'Cumulative',html:r=>`${r.cumulativePercent?.toFixed?.(1)??0}%`,cls:'num'},
    {label:'Operational Risk',html:r=>quantRiskPill(r.risk,r.risk==='สูง'?'danger':r.risk==='กลาง'?'warn':'good')}
  ],concRows.slice(0,20),'ยังไม่มีข้อมูลลูกค้าสำหรับคำนวณ Concentration');
  const cs=document.getElementById('quant-concentration-summary');if(cs)cs.innerHTML=`HHI ลูกค้า <b>${cHhi.hhi.toFixed(0)}</b> (${cHhi.label}) · ลูกค้ารายใหญ่สุด ${cHhi.top1.toFixed(1)}% · Top 5 ${cHhi.top5.toFixed(1)}% ของยอดขาย · คอลัมน์ HHI Contribution = Share² ช่วยเห็นว่าลูกค้ารายใดเพิ่มความกระจุกตัวมากที่สุด`;

  const anomalyMedian=quantMedian(active.map(r=>r.value));
  analyticsRenderTable('quant-anomaly-table',[
    {label:'ช่วงเวลา',html:r=>escapeHtml(r.label||`${MONTHS[r.month]} พ.ศ. ${yearLabelDual(r.year)}`)},
    {label:'ยอดขาย',html:r=>chartMoney(r.value),cls:'num'},
    {label:'เทียบ Median',html:r=>anomalyMedian?`${((safeNum(r.value)-anomalyMedian)/anomalyMedian*100)>=0?'+':''}${((safeNum(r.value)-anomalyMedian)/anomalyMedian*100).toFixed(1)}%`:'—',cls:'num'},
    {label:'Modified Z',html:r=>`<span class="quant-anomaly-z">${r.modifiedZ.toFixed(2)}</span>`,cls:'num'},
    {label:'Severity',html:r=>quantRiskPill(Math.abs(r.modifiedZ)>=6?'สูงมาก':'สูง',Math.abs(r.modifiedZ)>=6?'danger':'warn')},
    {label:'ความหมาย',html:r=>r.modifiedZ>0?'ยอดสูงผิดปกติ — ตรวจดีลก้อนใหญ่/ฤดูกาล':'ยอดต่ำผิดปกติ — ตรวจงานเลื่อน/ลูกค้าหาย/ข้อมูลตกหล่น'}
  ],anomalies,'ไม่พบยอดขายรายเดือนที่เกินเกณฑ์ |Modified Z| > 3.5 ในประวัติที่ใช้');
  const as=document.getElementById('quant-anomaly-summary');if(as)as.innerHTML=`MAD = ${chartMoney(quantMad(active.map(r=>r.value)))} · Median = ${chartMoney(anomalyMedian)} · เกณฑ์แจ้งเตือนใช้ |Modified Z| > 3.5 และควรตรวจสาเหตุเชิงธุรกิจก่อนสรุปว่าเป็นความผิดปกติของข้อมูล`;

  const salesShock=safeNum(document.getElementById('quant-stress-sales')?.value??-10),costShock=safeNum(document.getElementById('quant-stress-cost')?.value??5),conversionShock=safeNum(document.getElementById('quant-stress-conversion')?.value??-20);
  const stressedSales=kpis.sales*(1+salesShock/100),stressedCost=kpis.cost*(1+costShock/100),stressedCommission=kpis.commission*(1+salesShock/100),stressedProfit=stressedSales-stressedCost-stressedCommission-kpis.expenses,profitImpact=kpis.profit?((stressedProfit-kpis.profit)/Math.abs(kpis.profit))*100:null,stressedPipeline=pipelineExpected*Math.max(0,1+conversionShock/100);
  const contribution=kpis.sales-kpis.cost-kpis.commission,contributionRate=kpis.sales>0?contribution/kpis.sales:0,breakEvenSales=contributionRate>0?kpis.expenses/contributionRate:null,safetyMargin=breakEvenSales!==null&&kpis.sales>0?(kpis.sales-breakEvenSales)/kpis.sales*100:null;
  const stress=document.getElementById('quant-stress-output');if(stress)stress.innerHTML=`<div class="quant-stress-result"><div><small>กำไรฐาน</small><b>${chartMoney(kpis.profit)}</b></div><div class="${stressedProfit<0?'danger':''}"><small>กำไร Stress</small><b>${chartMoney(stressedProfit)}</b></div><div><small>ผลกระทบกำไร</small><b>${forecastPercent(profitImpact)}</b></div><div><small>Expected Pipeline หลัง Stress</small><b>${chartMoney(stressedPipeline)}</b></div><div><small>Break-even Sales</small><b>${breakEvenSales===null?'—':chartMoney(breakEvenSales)}</b></div><div class="${safetyMargin!==null&&safetyMargin<15?'danger':''}"><small>Margin of Safety</small><b>${safetyMargin===null?'—':`${safetyMargin.toFixed(1)}%`}</b></div></div><p class="quant-help">Scenario: Sales ${salesShock>=0?'+':''}${salesShock}% · Cost ${costShock>=0?'+':''}${costShock}% · Pipeline conversion ${conversionShock>=0?'+':''}${conversionShock}% · Break-even คำนวณจาก Contribution Margin ปัจจุบัน</p>`;

  const sigma=Number.isFinite(forecastTrend.forecastModel?.cv?.rmse)?forecastTrend.forecastModel.cv.rmse:quantSampleSd(active.map(r=>r.value));
  const mc=quantMonteCarlo(forecastTrend.forecast, sigma, 0, 5000, `analytics-${filter.year}-${filter.month}-${forecastTrend.forecastModel?.selectedId||'auto'}`);
  const decisionRows=quantDecisionTableRows({selected,cv,hhi:cHhi.hhi,drawdown:draw.percent,overdueRate,mc,target:0});
  const decision=document.getElementById('quant-decision-table');if(decision)decision.innerHTML=quantDecisionTableHtml(decisionRows);
  const ds=document.getElementById('quant-decision-summary');if(ds)ds.innerHTML=`Composite Risk <b>${riskScore.score}/100 (${riskScore.label})</b> · Forecast Governance: ${escapeHtml(quantForecastDecision(selected).label)} · Revenue-at-Risk จาก P10 ประมาณ <b>${chartMoney(mc.revenueAtRisk)}</b> · Score เป็น Internal Heuristic เพื่อจัดลำดับประเด็น ไม่ใช่คะแนนมาตรฐานสากล`;

  const note=document.getElementById('quant-methodology-note');if(note)note.innerHTML=`<b>วิธีอ่าน Quant Layer:</b> Forecast ใช้ Rolling-origin Cross-validation และอ่านร่วมกันทั้ง RMSE, WAPE, MASE, Bias และ Tracking Signal · CV ใช้ Sample SD/Mean เพื่อวัดความผันผวนสัมพัทธ์ · HHI = ผลรวมกำลังสองของสัดส่วนยอดขาย · Monte Carlo ใช้ CV RMSE เป็น empirical error scale เพื่อสร้าง P10/P50/P90 และ Revenue-at-Risk · Anomaly ใช้ Modified Z-score จาก Median/MAD · Composite Risk Score เป็น Internal Heuristic 0–100 ที่ให้น้ำหนักเท่ากัน 5 ด้าน: Volatility, Concentration, Drawdown, Collection และ Forecast Risk · Quote Probability เป็น historical approval proxy ไม่ใช่โมเดล ML และจะใช้ fallback 35% เมื่อข้อมูลย้อนหลังน้อยกว่า 5 ใบ`;
}

// ============================================================
// FILE ATTACH
// ============================================================
const ATTACHMENT_META={
  'q-att':{form:'q',docType:'quotes',label:'ใบเสนอราคา'},
  'i-att':{form:'i',docType:'invoices',label:'ใบส่งสินค้า / ใบกำกับภาษี'},
  'r-att':{form:'r',docType:'receipts',label:'ใบเสร็จรับเงิน'},
  'e-att':{form:'e',docType:'expenses',label:'ค่าใช้จ่าย'},
  'p-att':{form:'p',docType:'productions',label:'ใบสั่งผลิต'}
};

function getAttachmentBranch(k){
  const meta=ATTACHMENT_META[k];
  if(!meta)return null;
  const locked=getLockedUserBranch();
  if(locked){applyBranchUi(meta.form,locked);return locked;}
  return formBranch[meta.form]||null;
}

const MAX_ATTACHMENT_SIZE=50*1024*1024; // 50 MB ต่อไฟล์

function isImageFile(file){
  return String(file?.type||'').startsWith('image/')||/\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file?.name||'');
}
function isPdfFile(file){
  return String(file?.type||'')==='application/pdf'||/\.pdf$/i.test(file?.name||'');
}
function revokeAttachmentPreview(file){
  const url=file?.previewUrl;
  if(url && String(url).startsWith('blob:')){
    try{URL.revokeObjectURL(url);}catch(_){/* ignore */}
  }
}
function clearAttachedFiles(k){
  (attachedFiles[k]||[]).forEach(revokeAttachmentPreview);
  attachedFiles[k]=[];
  renderPrev(k);
}

function isSupportedEvidenceFile(file){
  return isImageFile(file)||isPdfFile(file);
}
function attachmentExtensionFromType(type='',fallbackName=''){
  const nameExt=String(fallbackName||'').match(/\.([a-z0-9]{2,8})$/i)?.[1];
  if(nameExt)return nameExt.toLowerCase();
  const mime=String(type||'').toLowerCase();
  if(mime==='application/pdf')return 'pdf';
  if(mime==='image/jpeg'||mime==='image/jpg')return 'jpg';
  if(mime==='image/png')return 'png';
  if(mime==='image/webp')return 'webp';
  if(mime==='image/gif')return 'gif';
  if(mime==='image/bmp')return 'bmp';
  if(mime==='image/heic')return 'heic';
  if(mime==='image/heif')return 'heif';
  return 'file';
}
function pastedAttachmentFileName(file,index=0){
  const ext=attachmentExtensionFromType(file?.type,file?.name);
  const d=new Date();
  const stamp=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
  const prefix=isPdfFile(file)?'clipboard-pdf':'clipboard-image';
  return `${prefix}-${stamp}${index?`-${index+1}`:''}.${ext}`;
}
function normalizeAttachmentFile(file,{source='picker',index=0}={}){
  if(!file)return null;
  const fromClipboard=source==='clipboard';
  const needsName=fromClipboard||!String(file.name||'').trim();
  const fileName=needsName?pastedAttachmentFileName(file,index):file.name;
  if(fileName===file.name)return file;
  try{
    return new File([file],fileName,{type:file.type||'application/octet-stream',lastModified:Date.now()});
  }catch(_){
    // Safari รุ่นเก่าบางรุ่นอาจสร้าง File ใหม่ไม่ได้ ให้ใช้ Blob เดิมแต่ตั้งชื่อใน metadata แทน
    return file;
  }
}
function requestDriveTokenWarmup(){
  // ขอ token ไว้ล่วงหน้าหลังผู้ใช้เพิ่มไฟล์ เพื่อลดโอกาส popup ถูก browser บล็อกตอนกดบันทึก
  if(window.GoogleDriveEvidence?.isConfigured?.()){
    window.GoogleDriveEvidence.getDriveAccessToken?.().catch(err=>{
      console.warn('ยังไม่ได้เชื่อม Google Drive:',err);
    });
  }
}
function addAttachmentFiles(k,files,{source='picker',input=null}={}){
  const meta=ATTACHMENT_META[k];
  const branch=getAttachmentBranch(k);
  if(meta && !branch){
    notify('กรุณาเลือกสาขาก่อนแนบหลักฐาน เพื่อจัดเก็บไฟล์ใน Google Drive ให้ถูกต้อง');
    if(input)input.value='';
    document.getElementById(meta.form+'-br-warn')?.classList.add('show');
    return 0;
  }

  if(!attachedFiles[k])attachedFiles[k]=[];
  const rejected=[];
  let added=0;
  Array.from(files||[]).forEach((rawFile,index)=>{
    const file=normalizeAttachmentFile(rawFile,{source,index})||rawFile;
    const fileName=file?.name||rawFile?.name||pastedAttachmentFileName(rawFile,index);
    if(!file){return;}
    if(file.size>MAX_ATTACHMENT_SIZE){
      rejected.push(`${fileName} (เกิน 50 MB)`);
      return;
    }
    if(!isSupportedEvidenceFile(file)){
      rejected.push(`${fileName} (รองรับเฉพาะรูปภาพหรือ PDF)`);
      return;
    }

    // Keep the original File object in memory. Do not convert images to Base64,
    // because Base64 makes localStorage overflow and blocks the Save button.
    const previewUrl=URL.createObjectURL(file);
    attachedFiles[k].push({
      name:fileName,
      originalName:fileName,
      type:file.type||rawFile?.type||'application/octet-stream',
      size:file.size||rawFile?.size||0,
      file,
      previewUrl,
      provider:'pending-google-drive',
      branch:branch||'',
      docType:meta?.docType||'',
      addedFrom:source
    });
    added+=1;
  });
  renderPrev(k);
  if(input)input.value='';
  if(rejected.length)notify('ไฟล์ต่อไปนี้ไม่ได้ถูกเพิ่ม:\n'+rejected.join('\n'));
  if(added)requestDriveTokenWarmup();
  return added;
}
function handleFiles(k,inp){
  return addAttachmentFiles(k,inp?.files||[],{source:'picker',input:inp});
}
function clipboardEvidenceFiles(event){
  const data=event?.clipboardData;
  if(!data)return [];
  const files=[];
  if(data.items?.length){
    Array.from(data.items).forEach(item=>{
      if(item.kind!=='file')return;
      const file=item.getAsFile?.();
      if(file)files.push(file);
    });
  }
  if(!files.length&&data.files?.length){
    files.push(...Array.from(data.files));
  }
  return files;
}
function cssEscape(value){
  if(window.CSS?.escape)return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g,'\\$&');
}
function showAttachmentPasteStatus(k,message,type='success'){
  const zone=document.querySelector(`[data-attachment-key="${cssEscape(k)}"]`);
  const preview=document.getElementById(k);
  const parent=zone?.parentElement||preview?.parentElement;
  if(!zone||!parent)return;
  let status=parent.querySelector(`.attachment-paste-status[data-for="${cssEscape(k)}"]`);
  if(!status){
    status=document.createElement('div');
    status.className='attachment-paste-status';
    status.dataset.for=k;
    zone.insertAdjacentElement('afterend',status);
  }
  status.textContent=message;
  status.dataset.type=type;
  const flashClass=type==='success'?'paste-flash':'paste-error';
  zone.classList.add(flashClass);
  preview?.classList.add(flashClass);
  clearTimeout(zone._pasteTimer);
  zone._pasteTimer=setTimeout(()=>{
    zone.classList.remove('paste-flash','paste-error','drag-over');
    preview?.classList.remove('paste-flash','paste-error','drag-over');
    if(status)status.textContent='';
  },2600);
}
function handleAttachmentPaste(k,event){
  const files=clipboardEvidenceFiles(event);
  if(!files.length)return;
  const supported=files.filter(isSupportedEvidenceFile);
  if(!supported.length){
    event.preventDefault();
    showAttachmentPasteStatus(k,'ยังไม่พบรูปภาพหรือ PDF ใน Clipboard','error');
    return;
  }
  event.preventDefault();
  const added=addAttachmentFiles(k,supported,{source:'clipboard'});
  if(added)showAttachmentPasteStatus(k,`วางไฟล์จาก Clipboard แล้ว ${added} ไฟล์`,'success');
}
function hasDraggedFiles(event){
  const types=Array.from(event?.dataTransfer?.types||[]);
  return types.includes('Files')||types.includes('application/x-moz-file');
}
function handleAttachmentDragOver(target,event){
  if(!hasDraggedFiles(event))return;
  event.preventDefault();
  event.stopPropagation();
  if(event.dataTransfer)event.dataTransfer.dropEffect='copy';
  target?.classList.add('drag-over');
}
function handleAttachmentDragLeave(target,event){
  if(event?.relatedTarget&&target?.contains?.(event.relatedTarget))return;
  target?.classList.remove('drag-over');
}
function handleAttachmentDrop(k,target,event){
  if(!hasDraggedFiles(event))return;
  event.preventDefault();
  event.stopPropagation();
  target?.classList.remove('drag-over');
  const files=Array.from(event.dataTransfer?.files||[]);
  if(!files.length){
    showAttachmentPasteStatus(k,'ไม่พบไฟล์ที่ลากมาวาง','error');
    return;
  }
  const supported=files.filter(isSupportedEvidenceFile);
  if(!supported.length){
    showAttachmentPasteStatus(k,'รองรับเฉพาะไฟล์ PDF และรูปภาพเท่านั้น','error');
    return;
  }
  const added=addAttachmentFiles(k,supported,{source:'drop'});
  if(added)showAttachmentPasteStatus(k,`ลากไฟล์ PDF/รูปภาพมาวางแล้ว ${added} ไฟล์`,'success');
}
function bindAttachmentDropTarget(target,key){
  if(!target||target.dataset.dropReady==='1')return;
  target.dataset.dropReady='1';
  target.addEventListener('dragenter',event=>handleAttachmentDragOver(target,event));
  target.addEventListener('dragover',event=>handleAttachmentDragOver(target,event));
  target.addEventListener('dragleave',event=>handleAttachmentDragLeave(target,event));
  target.addEventListener('drop',event=>handleAttachmentDrop(key,target,event));
}
function initGlobalAttachmentDropSafety(){
  if(window.__comformGlobalAttachmentDropSafety)return;
  window.__comformGlobalAttachmentDropSafety=true;
  ['dragover','drop'].forEach(eventName=>{
    window.addEventListener(eventName,event=>{
      if(!hasDraggedFiles(event))return;
      const target=event.target?.closest?.('[data-attachment-key], .file-preview[data-attachment-key-preview="1"]');
      if(target)return;
      // ป้องกัน browser เปิด PDF/รูปภาพแทนหน้าเว็บเมื่อผู้ใช้ปล่อยไฟล์ผิดตำแหน่ง
      event.preventDefault();
    });
  });
}
function initAttachmentPasteZones(root=document){
  initGlobalAttachmentDropSafety();
  root.querySelectorAll?.('[data-attachment-key]').forEach(zone=>{
    if(zone.dataset.pasteReady==='1')return;
    const key=zone.dataset.attachmentKey;
    zone.dataset.pasteReady='1';
    if(!zone.hasAttribute('tabindex'))zone.tabIndex=0;
    zone.title='คลิกเลือกไฟล์ ลาก PDF/รูปภาพมาวาง หรือกด Ctrl+V เพื่อวางรูปจาก Clipboard';
    zone.addEventListener('paste',event=>handleAttachmentPaste(key,event));
    zone.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){
        const input=zone.querySelector('input[type="file"]');
        if(input){event.preventDefault();input.click();}
      }
    });
    bindAttachmentDropTarget(zone,key);
  });
  Object.keys(ATTACHMENT_META).forEach(key=>{
    const preview=document.getElementById(key);
    if(!preview)return;
    preview.dataset.attachmentKeyPreview='1';
    preview.dataset.attachmentKey=key;
    if(preview.dataset.pasteReady!=='1'){
      preview.dataset.pasteReady='1';
      preview.tabIndex=0;
      preview.title='ลาก PDF/รูปภาพมาวางในพื้นที่นี้ หรือกด Ctrl+V เพื่อวางรูปภาพจาก Clipboard';
      preview.addEventListener('paste',event=>handleAttachmentPaste(key,event));
    }
    bindAttachmentDropTarget(preview,key);
  });
}
const EXPENSE_DOC_TYPE_LABELS={
  receipt:'ใบเสร็จรับเงิน',
  tax_invoice:'ใบกำกับภาษีเต็มรูป',
  receipt_tax_invoice:'ใบเสร็จรับเงิน / ใบกำกับภาษี',
  abbreviated_tax_invoice:'ใบกำกับภาษีอย่างย่อ',
  invoice:'ใบแจ้งหนี้ / Invoice',
  other:'เอกสารอื่น ๆ',
  none:'ไม่มีเอกสาร'
};
const EXPENSE_TAX_STATUS_LABELS={
  requested:'ยื่นขอใบกำกับภาษีแล้ว',
  received:'ได้รับใบกำกับภาษีแล้ว',
  not_requested:'ยังไม่ได้ยื่นขอ',
  not_required:'ไม่ต้องใช้ใบกำกับภาษี'
};
const EXPENSE_PURPOSE_LABELS={
  company:'ค่าใช้จ่ายของบริษัท',
  customer_job:'ค่าใช้จ่ายสำหรับงานลูกค้า',
  delivery:'ค่าใช้จ่ายสำหรับส่งสินค้า',
  production:'ค่าใช้จ่ายสำหรับการผลิต',
  other:'อื่น ๆ'
};
function expenseDocTypeLabel(value){return EXPENSE_DOC_TYPE_LABELS[value]||value||'-';}
function expenseTaxStatusLabel(value){return EXPENSE_TAX_STATUS_LABELS[value]||value||'-';}
function expensePurposeLabel(value){return EXPENSE_PURPOSE_LABELS[value]||value||'-';}
function expenseEvidenceMeta(){
  return{
    cat:getElValue('e-cat')||'ยังไม่ระบุหมวดหมู่',
    vendor:getElValue('e-vendor'),
    docType:getElValue('e-doc-type')||'receipt',
    taxStatus:getElValue('e-tax-status')||'requested',
    docNo:getElValue('e-doc-no'),
    purpose:getElValue('e-purpose')||'company',
    amount:parseMoney(getElValue('e-amount')),
    desc:getElValue('e-desc')
  };
}
function expenseTaxStatusClass(status){
  if(status==='received')return 'good';
  if(status==='requested')return 'info';
  if(status==='not_requested')return 'warn';
  return 'neutral';
}
function updateExpenseEvidenceSummaryOnly(){
  const host=document.getElementById('e-evidence-summary');if(!host)return;
  const meta=expenseEvidenceMeta();
  const files=attachedFiles['e-att']||[];
  const images=files.filter(isImageFile).length;
  const pdfs=files.filter(isPdfFile).length;
  host.innerHTML=`
    <div class="expense-summary-main">
      <div><small>ค่าใช้จ่าย</small><b>${escapeHtml(meta.cat)}</b><span>${escapeHtml(meta.desc||'กรอกรายละเอียดเพื่อช่วยจำรายการนี้')}</span></div>
      <strong>${meta.amount>0?'฿'+fmt(meta.amount):'฿0.00'}</strong>
    </div>
    <div class="expense-summary-tags">
      <span>🏪 ${escapeHtml(meta.vendor||'ยังไม่ระบุร้านค้า/ผู้ขาย')}</span>
      <span>🧾 ${escapeHtml(expenseDocTypeLabel(meta.docType))}${meta.docNo?' · '+escapeHtml(meta.docNo):''}</span>
      <span class="${expenseTaxStatusClass(meta.taxStatus)}">VAT · ${escapeHtml(expenseTaxStatusLabel(meta.taxStatus))}</span>
      <span>🏢 ${escapeHtml(expensePurposeLabel(meta.purpose))}</span>
      <span>📎 ${files.length} ไฟล์ · รูป ${images} · PDF ${pdfs}</span>
    </div>`;
}
function refreshExpenseEvidenceUi(){
  renderPrev('e-att');
}
window.refreshExpenseEvidenceUi=refreshExpenseEvidenceUi;
function renderPrev(k){
  const el=document.getElementById(k);if(!el)return;
  const files=attachedFiles[k]||[];
  if(k!=='e-att'){
    el.innerHTML=files.map((f,i)=>{
      const fileType=f.type||f.mimeType||'';
      const fileName=f.name||f.originalName||'ไฟล์แนบ';
      const providerBadge=f.provider==='google-drive'?'DRIVE':(f.provider==='pending-google-drive'?'รออัปโหลด Drive':'LOCAL');
      const previewSrc=f.previewUrl||f.data||'';
      const browserPreviewableImage=isImageFile(f)&&!/\.(heic|heif)$/i.test(fileName)&&Boolean(previewSrc);
      return `
      <div class="fthumb" title="${escapeHtml(fileName)}">
        ${browserPreviewableImage
          ?`<img src="${previewSrc}" alt="${escapeHtml(fileName)}" onclick="viewFile('${k}',${i})" title="คลิกดูรูป">`
          :`<div class="pdf-icon" onclick="viewFile('${k}',${i})" title="คลิกเปิดไฟล์"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>${isPdfFile(f)?'PDF':(isImageFile(f)?'IMAGE':'FILE')}<span style="font-size:9px;font-weight:400">${escapeHtml(fileName.substring(0,10))}</span></div>`}
        <div style="font-size:8px;color:var(--blue);text-align:center;line-height:1.1">${providerBadge}</div>
        <button class="rm" onclick="rmFile('${k}',${i})">×</button>
      </div>`;
    }).join('');
    return;
  }

  const expenseMeta=expenseEvidenceMeta();
  el.innerHTML=files.map((f,i)=>{
    const fileName=f.name||f.originalName||'ไฟล์แนบ';
    const providerBadge=f.provider==='google-drive'?'DRIVE':(f.provider==='pending-google-drive'?'รออัปโหลด Drive':'LOCAL');
    const previewSrc=f.previewUrl||f.data||'';
    const browserPreviewableImage=isImageFile(f)&&!/\.(heic|heif)$/i.test(fileName)&&Boolean(previewSrc);
    return `
    <div class="fthumb expense-evidence-thumb" title="${escapeHtml(fileName)}">
      <div class="expense-thumb-preview">
        ${browserPreviewableImage
          ?`<img src="${previewSrc}" alt="${escapeHtml(fileName)}" onclick="viewFile('${k}',${i})" title="คลิกดูรูป">`
          :`<div class="pdf-icon" onclick="viewFile('${k}',${i})" title="คลิกเปิดไฟล์"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>${isPdfFile(f)?'PDF':(isImageFile(f)?'IMAGE':'FILE')}<span style="font-size:9px;font-weight:400">${escapeHtml(fileName.substring(0,10))}</span></div>`}
        <div class="expense-provider-badge">${providerBadge}</div>
      </div>
      <div class="expense-thumb-meta"><b>${escapeHtml(expenseMeta.cat)}</b><span>${escapeHtml(expenseDocTypeLabel(expenseMeta.docType))}</span><span class="${expenseTaxStatusClass(expenseMeta.taxStatus)}">${escapeHtml(expenseTaxStatusLabel(expenseMeta.taxStatus))}</span></div>
      <button class="rm" onclick="rmFile('${k}',${i})" aria-label="ลบไฟล์">×</button>
    </div>`;
  }).join('');
  updateExpenseEvidenceSummaryOnly();
}
function rmFile(k,i){
  const file=(attachedFiles[k]||[])[i];
  revokeAttachmentPreview(file);
  attachedFiles[k].splice(i,1);
  renderPrev(k);
}
async function viewFile(k,i){
  const f=(attachedFiles[k]||[])[i];if(!f)return;
  if(f.webViewLink){window.open(f.webViewLink,'_blank','noopener');return;}

  let src=f.previewUrl||f.data||'';
  if(!src && f.localId && window.LocalFileStore?.getLocalAttachmentUrl){
    src=await window.LocalFileStore.getLocalAttachmentUrl(f.localId);
  }
  if(!src){notify('ไม่พบข้อมูลไฟล์ในเครื่องนี้');return;}

  const w=window.open('','_blank');
  if(!w)return;
  if(isPdfFile(f))w.document.write(`<iframe src="${src}" style="width:100%;height:100vh;border:none"></iframe>`);
  else if(isImageFile(f))w.document.write(`<img src="${src}" style="max-width:100%;height:auto">`);
  else w.location.href=src;
}

window.addEventListener('beforeunload',()=>{
  Object.values(attachedFiles).flat().forEach(revokeAttachmentPreview);
});
window.addEventListener('comform-drive-upload-error',ev=>{
  const msg=ev?.detail?.message||'ไม่ทราบสาเหตุ';
  notify('บันทึกข้อมูลได้ แต่หลักฐานอัปโหลดเข้า Google Drive ไม่สำเร็จ\nระบบจะเก็บไฟล์แบบ local-only ชั่วคราวในเครื่องนี้แทน\nสาเหตุ: '+msg);
});

// ============================================================
// ITEMS TABLE HELPERS
// ============================================================
function uSel(v){return`<select style="width:82px">${UNITS.map(u=>`<option${u===v?' selected':''}>${u}</option>`).join('')}</select>`;}
function addQItem(item={}){item=enrichProductItem(item);const tb=document.getElementById('q-items-body');const tr=document.createElement('tr');tr.innerHTML=`<td><input data-field="product" type="text" list="product-master-list" data-product-code="${escapeHtml(item.productCode||'')}" data-product-category="${escapeHtml(item.productCategory||'')}" value="${escapeHtml(item.product||'')}" placeholder="เลือกหรือพิมพ์ชื่อสินค้า" onchange="applyProductMasterToInput(this)"><small class="product-type-note"></small></td><td><input type="number" min="0" step="0.01" value="${item.qty??''}" placeholder="0" oninput="calcQ()" style="width:55px"></td><td>${uSel(item.unit||'')}</td><td><div class="quote-price-rule-cell"><input data-field="price-unit" type="number" min="0" step="0.01" value="${item.priceUnit??''}" placeholder="0.00" oninput="calcQ()"><button type="button" class="quote-price-rule-btn" onclick="applySuggestedQuotePrice(this)" title="คำนวณจาก Standard Cost + Business Rules ของบริษัท">⚙ ราคาแนะนำ</button></div></td><td><input class="ro" readonly></td><td><button onclick="this.closest('tr').remove();calcQ()" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:16px">×</button></td>`;tb.appendChild(tr);const input=tr.querySelector('[data-field="product"]');if(input)applyProductMasterToInput(input);calcQ();}
function applySuggestedQuotePrice(button){const tr=button?.closest?.('tr');if(!tr)return;const productInput=tr.querySelector('[data-field="product"]');const productName=productInput?.value||'',productCode=productInput?.dataset.productCode||'',category=productInput?.dataset.productCategory||'';const customer=document.getElementById('q-cust')?.value.trim()||'';const result=window.BusinessRulesService?.suggestQuoteUnitPrice?.({productCode,productName,category,customer});if(!result){notify('ยังคำนวณราคาแนะนำไม่ได้ กรุณากำหนดต้นทุนมาตรฐานใน Product Master และตั้ง Business Rules ก่อน');return;}const priceInput=tr.querySelector('[data-field="price-unit"]');if(priceInput){priceInput.value=Number(result.suggestedUnitPrice||0).toFixed(2);calcQ();notify(`ใช้ราคาแนะนำ ${fmt(result.suggestedUnitPrice)} บาท จาก ${result.formulaCode} แล้ว`,'success');}}
function invoiceCostModeSelect(selected='unit'){
  return `<select data-field="costMode" class="i-cost-mode" onchange="updateInvoiceCostPlaceholder(this);calcI()" style="min-width:155px">
    <option value="unit" ${selected==='unit'?'selected':''}>ราคาต้นทุนต่อหน่วย</option>
    <option value="lump" ${selected==='lump'?'selected':''}>ราคาเหมา</option>
  </select>`;
}
function updateInvoiceCostPlaceholder(select){
  const row=select?.closest('tr');
  const input=row?.querySelector('[data-field="costValue"]');
  if(!input)return;
  const lump=select.value==='lump';
  input.placeholder=lump?'ต้นทุนรวมแบบเหมา':'ต้นทุนต่อหน่วย';
  input.title=lump?'กรอกต้นทุนรวมของรายการนี้':'กรอกต้นทุนต่อ 1 หน่วย';
}
function addIItem(item={}){
  item=enrichProductItem(item);
  const tb=document.getElementById('i-items-body');
  if(!tb)return;
  const tr=document.createElement('tr');
  const costMode=item.costMode==='lump'?'lump':'unit';
  const costValue=Number(item.costValue ?? (costMode==='lump' ? item.costLump : item.costUnit) ?? 0)||0;
  const unitSelect=uSel(item.unit||'').replace('<select','<select data-field="unit" onchange="calcI()"');
  tr.innerHTML=`
    <td><input data-field="product" type="text" list="product-master-list" data-product-code="${escapeHtml(item.productCode||'')}" data-product-category="${escapeHtml(item.productCategory||'')}" placeholder="เลือกหรือพิมพ์ชื่อสินค้า" value="${escapeHtml(item.product||'')}" onchange="applyProductMasterToInput(this)"><small class="product-type-note"></small></td>
    <td><input data-field="qty" type="number" min="0" step="0.01" placeholder="0" value="${item.qty??''}" oninput="calcI()" style="width:65px"></td>
    <td>${unitSelect}</td>
    <td>${invoiceCostModeSelect(costMode)}</td>
    <td><input data-field="costValue" type="number" min="0" step="0.01" value="${costValue||''}" placeholder="${costMode==='lump'?'ต้นทุนรวมแบบเหมา':'ต้นทุนต่อหน่วย'}" oninput="calcI()"></td>
    <td><input data-field="priceUnit" type="number" min="0" step="0.01" placeholder="0.00" value="${item.priceUnit??''}" oninput="calcI()"></td>
    <td><input data-field="saleTotal" class="ro" readonly></td>
    <td><input data-field="costTotal" class="ro" readonly></td>
    <td><button onclick="this.closest('tr').remove();calcI()" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:16px">×</button></td>`;
  tb.appendChild(tr);
  const productInput=tr.querySelector('[data-field="product"]');if(productInput)applyProductMasterToInput(productInput);
  calcI();
}
function addRItem(p,q,u,pu,cu,meta={}){const item=enrichProductItem(typeof p==='object'?p:{product:p,qty:q,unit:u,priceUnit:pu,costUnit:cu,...meta});const tb=document.getElementById('r-items-body');const tr=document.createElement('tr');tr.innerHTML=`<td><input data-field="product" type="text" list="product-master-list" data-product-code="${escapeHtml(item.productCode||'')}" data-product-category="${escapeHtml(item.productCategory||'')}" value="${escapeHtml(item.product||'')}" placeholder="เลือกหรือพิมพ์ชื่อสินค้า" onchange="applyProductMasterToInput(this)"><small class="product-type-note"></small></td><td><input type="number" min="0" value="${item.qty??''}" placeholder="0" oninput="calcR()" style="width:55px"></td><td>${uSel(item.unit||'')}</td><td><input type="number" min="0" step="0.01" value="${item.priceUnit??''}" placeholder="0.00" oninput="calcR()"></td><td><input class="ro" readonly></td><td><input type="number" min="0" step="0.01" value="${item.costUnit??''}" placeholder="0.00" oninput="calcR()"></td><td><button onclick="this.closest('tr').remove();calcR()" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:16px">×</button></td>`;tb.appendChild(tr);const input=tr.querySelector('[data-field="product"]');if(input)applyProductMasterToInput(input);calcR();}

// ============================================================
// COMMISSION MODE HELPERS
// ============================================================
function parseMoney(v){return parseFloat(String(v||'').replace(/,/g,''))||0;}
function getCommMode(prefix){return document.getElementById(prefix+'-comm-mode')?.value||'percent';}
function toggleCommMode(prefix){
  const mode=getCommMode(prefix);
  const rate=document.getElementById(prefix+'-cr');
  const amount=document.getElementById(prefix+'-ca');
  if(!amount)return;
  const manual=mode==='manual';
  amount.readOnly=!manual;
  amount.classList.toggle('ro',!manual);
  amount.placeholder=manual?'กรอกจำนวนเงินคอมฯ':'0.00';
  if(rate)rate.disabled=manual;
  if(manual && amount.value){amount.value=String(amount.value).replace(/,/g,'');}
}
function commLabel(doc){
  return doc.commMode==='manual'?'ค่าคอมมิสชัน (กรอกเอง)':'ค่าคอมมิสชัน ('+(doc.commRate||0)+'%)';
}

// ============================================================
// CALC
// ============================================================
function calcQ(){let sub=0;document.querySelectorAll('#q-items-body tr').forEach(tr=>{const ins=tr.querySelectorAll('input[type=number]');const qty=parseFloat(ins[0]?.value)||0,pu=parseFloat(ins[1]?.value)||0,t=qty*pu;sub+=t;const ro=tr.querySelector('input.ro');if(ro)ro.value=t?fmt(t):'';});const uv=parseInt(document.getElementById('q-vat').value),va=uv?sub*.07:0;document.getElementById('q-sub').value=sub?fmt(sub):'';document.getElementById('q-vat-amt').value=va?fmt(va):'';document.getElementById('q-total').value=(sub+va)?fmt(sub+va):'';}
function calcI(){
  let rawSaleTotal=0,ct=0;
  document.querySelectorAll('#i-items-body tr').forEach(tr=>{
    const qty=parseFloat(tr.querySelector('[data-field="qty"]')?.value)||0;
    const costMode=tr.querySelector('[data-field="costMode"]')?.value==='lump'?'lump':'unit';
    const costValue=parseFloat(tr.querySelector('[data-field="costValue"]')?.value)||0;
    const priceUnit=parseFloat(tr.querySelector('[data-field="priceUnit"]')?.value)||0;
    const saleTotal=qty*priceUnit;
    const costTotal=costMode==='lump'?costValue:qty*costValue;
    rawSaleTotal+=saleTotal;
    ct+=costTotal;
    const saleOut=tr.querySelector('[data-field="saleTotal"]');
    const costOut=tr.querySelector('[data-field="costTotal"]');
    if(saleOut)saleOut.value=saleTotal?fmt(saleTotal):'';
    if(costOut)costOut.value=costTotal?fmt(costTotal):'';
  });
  const useVat=parseInt(document.getElementById('i-vat')?.value||0);
  const vat=calculateVatSummary(rawSaleTotal,useVat);
  const cr=parseFloat(document.getElementById('i-cr').value)||0;
  const mode=getCommMode('i');
  const comm=mode==='manual'?parseMoney(document.getElementById('i-ca').value):vat.subtotal*cr/100;
  const pf=vat.subtotal-ct-comm;
  document.getElementById('i-st').value=vat.subtotal?fmt(vat.subtotal):'';
  document.getElementById('i-vat-amt').value=vat.vatAmt?fmt(vat.vatAmt):'';
  document.getElementById('i-grand-total').value=vat.total?fmt(vat.total):'';
  document.getElementById('i-ct').value=ct?fmt(ct):'';
  if(mode!=='manual')document.getElementById('i-ca').value=comm?fmt(comm):'';
  document.getElementById('i-pf').value=(vat.subtotal||ct||comm)?fmt(pf):'';
  document.getElementById('i-pf').style.color=pf<0?'var(--red)':'var(--green)';
}

function calcR(){
  let rawSaleTotal=0,ct=0;
  document.querySelectorAll('#r-items-body tr').forEach(tr=>{
    const ins=tr.querySelectorAll('input[type=number]');
    const qty=parseFloat(ins[0]?.value)||0;
    const pu=parseFloat(ins[1]?.value)||0;
    const cu=parseFloat(ins[2]?.value)||0;
    const saleTotal=qty*pu;
    const costTotal=qty*cu;
    rawSaleTotal+=saleTotal;
    ct+=costTotal;
    const ro=tr.querySelector('input.ro');
    if(ro)ro.value=saleTotal?fmt(saleTotal):'';
  });
  const useVat=parseInt(document.getElementById('r-vat')?.value||0);
  const vat=calculateVatSummary(rawSaleTotal,useVat);
  const cr=parseFloat(document.getElementById('r-cr').value)||0;
  const mode=getCommMode('r');
  const comm=mode==='manual'?parseMoney(document.getElementById('r-ca').value):vat.subtotal*cr/100;
  const pf=vat.subtotal-ct-comm;
  document.getElementById('r-st').value=rawSaleTotal?fmt(rawSaleTotal):'';
  const subEl=document.getElementById('r-subtotal');if(subEl)subEl.value=vat.subtotal?fmt(vat.subtotal):'';
  const vatEl=document.getElementById('r-vat-amt');if(vatEl)vatEl.value=vat.vatAmt?fmt(vat.vatAmt):'';
  const totalEl=document.getElementById('r-grand-total');if(totalEl)totalEl.value=vat.total?fmt(vat.total):'';
  document.getElementById('r-ct').value=ct?fmt(ct):'';
  if(mode!=='manual')document.getElementById('r-ca').value=comm?fmt(comm):'';
  document.getElementById('r-pf').value=(vat.subtotal||ct||comm)?fmt(pf):'';
  document.getElementById('r-pf').style.color=pf<0?'var(--red)':'var(--green)';
}


// ============================================================
// GET ITEMS FROM TABLE
// ============================================================
function getQItems(){const customer=document.getElementById('q-cust')?.value.trim()||'';return Array.from(document.querySelectorAll('#q-items-body tr')).map(tr=>{const productInput=tr.querySelector('[data-field="product"]')||tr.querySelector('input[type=text]');const nums=tr.querySelectorAll('input[type=number]');const sel=tr.querySelector('select');const qty=parseFloat(nums[0]?.value)||0,pu=parseFloat(nums[1]?.value)||0;const base=enrichProductItem({product:productInput?.value||'',productCode:productInput?.dataset.productCode||'',productCategory:productInput?.dataset.productCategory||'',qty,unit:sel?.value||'',priceUnit:pu,total:qty*pu});const pricingRuleSnapshot=window.BusinessRulesService?.snapshotForItem?.({productCode:base.productCode,productName:base.product,category:base.productCategory,customer,actualUnitPrice:pu})||null;return{...base,pricingRuleSnapshot};});}
function getIItems(){
  return Array.from(document.querySelectorAll('#i-items-body tr')).map(tr=>{
    const productInput=tr.querySelector('[data-field="product"]');
    const product=productInput?.value||'';
    const productMeta=productMasterMeta(product,productInput?.dataset.productCode||'',productInput?.dataset.productCategory||'');
    const qty=parseFloat(tr.querySelector('[data-field="qty"]')?.value)||0;
    const unit=tr.querySelector('[data-field="unit"]')?.value||'';
    const costMode=tr.querySelector('[data-field="costMode"]')?.value==='lump'?'lump':'unit';
    const costValue=parseFloat(tr.querySelector('[data-field="costValue"]')?.value)||0;
    const priceUnit=parseFloat(tr.querySelector('[data-field="priceUnit"]')?.value)||0;
    const costTotal=costMode==='lump'?costValue:qty*costValue;
    const costUnit=costMode==='unit'?costValue:(qty>0?costTotal/qty:0);
    return{
      product,productCode:productMeta.productCode,productCategory:productMeta.productCategory,flowType:productMeta.flowType,fulfillmentType:productMeta.fulfillmentType,qty,unit,costMode,costValue,
      costUnit,
      costLump:costMode==='lump'?costValue:0,
      priceUnit,
      saleTotal:qty*priceUnit,
      costTotal
    };
  });
}
function getRItems(){return Array.from(document.querySelectorAll('#r-items-body tr')).map(tr=>{const ins=tr.querySelectorAll('input[type=number]');const sel=tr.querySelector('select');const qty=parseFloat(ins[0]?.value)||0,pu=parseFloat(ins[1]?.value)||0,cu=parseFloat(ins[2]?.value)||0;const p=tr.querySelector('[data-field="product"]')||tr.querySelector('input[type=text]');return enrichProductItem({product:p?.value||'',productCode:p?.dataset.productCode||'',productCategory:p?.dataset.productCategory||'',qty,unit:sel?.value||'',priceUnit:pu,saleTotal:qty*pu,costUnit:cu});});}

// ============================================================

// ============================================================
// PRODUCTION ORDER — ฟอร์มสั่งผลิตสินค้า
// ============================================================
function getPUnitOptions(selected='กล่อง'){
  // ใช้รายการหน่วยมาตรฐานเดียวกับหน้าใบส่งสินค้า / ใบกำกับภาษี
  const standardUnits=['กล่อง','ชุด','เครื่อง','ดวง','ม้วน','ตลับ','อัน','แผ่น','ขวด','ถุง','เล่ม','ซอง','อื่น ๆ'];
  // รองรับข้อมูลเก่าที่เคยบันทึกหน่วยอื่นไว้ โดยไม่ทำให้ค่าหายตอนเปิดดู
  const units=standardUnits.includes(selected)?standardUnits:[selected,...standardUnits];
  return units.map(u=>`<option value="${u}" ${u===selected?'selected':''}>${u}</option>`).join('');
}
function getPCostModeOptions(selected='unit'){
  return `
    <option value="unit" ${selected==='unit'?'selected':''}>ราคาต้นทุนต่อหน่วย</option>
    <option value="lump" ${selected==='lump'?'selected':''}>ราคาเหมา</option>`;
}
function normalizePItemInput(itemOrQty={},cost='',unit='กล่อง',costMode='unit'){
  if(itemOrQty && typeof itemOrQty==='object' && !Array.isArray(itemOrQty))return itemOrQty;
  return{qty:itemOrQty,costValue:cost,unit,costMode};
}
function addPItem(itemOrQty={},cost='',unit='กล่อง',costMode='unit'){
  const tb=document.getElementById('p-items-body');if(!tb)return;
  const item=enrichProductItem(normalizePItemInput(itemOrQty,cost,unit,costMode));
  const qty=item.qty??'';
  const selectedUnit=item.unit||'กล่อง';
  const selectedCostMode=item.costMode==='lump'?'lump':'unit';
  const costValue=Number(item.costValue ?? (selectedCostMode==='lump'?item.costLump:item.costUnit) ?? 0)||0;
  // UI ใหม่รองรับเฉพาะราคาขายต่อหน่วย แต่ยังแปลงข้อมูลเก่าแบบราคาเหมาให้เปิดดูได้
  const qtyNumber=Number(qty)||0;
  const legacySaleTotal=Number(item.saleTotal ?? item.saleLump ?? item.saleValue ?? 0)||0;
  const saleValue=item.saleMode==='lump'
    ? (qtyNumber>0?legacySaleTotal/qtyNumber:Number(item.priceUnit||0))
    : (Number(item.priceUnit ?? item.saleValue ?? 0)||0);
  const tr=document.createElement('tr');
  tr.innerHTML=`
    <td class="tn p-row-no"></td>
    <td><input class="p-product-preset" type="text" list="product-master-list" value="${escapeHtml(item.product||'')}" placeholder="เลือกชื่อสินค้าจากรายการ หรือพิมพ์เอง" onchange="applyProductionProductPreset(this)"><textarea class="p-product" placeholder="ชื่อสินค้า / รายละเอียด" rows="2">${escapeHtml(item.product||'')}</textarea></td>
    <td><input class="p-qty" type="number" min="0" step="0.01" value="${qty}" placeholder="0" oninput="calcP()"></td>
    <td><select class="p-unit" onchange="calcP()">${getPUnitOptions(selectedUnit)}</select></td>
    <td><select class="p-cost-mode" onchange="calcP()">${getPCostModeOptions(selectedCostMode)}</select></td>
    <td><input class="p-cost-value" type="number" min="0" step="0.01" value="${costValue||''}" placeholder="0.00" oninput="calcP()"></td>
    <td><input class="p-cost-total ro" readonly></td>
    <td><input class="p-sale-value" type="number" min="0" step="0.01" value="${saleValue||''}" placeholder="ราคาขายต่อหน่วย" oninput="calcP()"></td>
    <td><input class="p-sale-total ro readonly-big" readonly></td>
    <td><button class="btn btn-danger btn-sm" onclick="this.closest('tr').remove();calcP()">ลบ</button></td>`;
  tr.dataset.productCode=item.productCode||'';tr.dataset.productCategory=item.productCategory||'';
  tb.appendChild(tr);calcP();
}
function applyProductionProductPreset(input){
  const row=input?.closest('tr'),text=row?.querySelector('.p-product');if(!row||!text)return;
  const meta=productMasterMeta(input.value);
  if(meta.productName){text.value=meta.productName;row.dataset.productCode=meta.productCode||'';row.dataset.productCategory=meta.productCategory||'';}
  calcP();
}
function calcP(){
  const useVat=parseInt(document.querySelector('input[name="p-vat"]:checked')?.value||0);
  const useCostVat=parseInt(document.querySelector('input[name="p-cost-vat"]:checked')?.value||0);
  let rawSaleTotal=0,costTotalAll=0;
  document.querySelectorAll('#p-items-body tr').forEach((tr,idx)=>{
    const qty=parseMoney(tr.querySelector('.p-qty')?.value);
    const costMode=tr.querySelector('.p-cost-mode')?.value==='lump'?'lump':'unit';
    const costValue=parseMoney(tr.querySelector('.p-cost-value')?.value);
    const saleValue=parseMoney(tr.querySelector('.p-sale-value')?.value);
    const costTotal=costMode==='lump'?costValue:qty*costValue;
    const saleTotal=qty*saleValue;
    const no=tr.querySelector('.p-row-no');if(no)no.textContent=idx+1;
    const costOut=tr.querySelector('.p-cost-total');if(costOut)costOut.value=(qty||costValue)?fmt(costTotal):'';
    const saleOut=tr.querySelector('.p-sale-total');if(saleOut)saleOut.value=(qty||saleValue)?fmt(saleTotal):'';
    costTotalAll+=costTotal;rawSaleTotal+=saleTotal;
  });
  const saleVat=calculateVatSummary(rawSaleTotal,useVat);
  // ต้นทุน: รวม VAT = บวก 7%, ไม่รวม VAT = ใช้ยอดต้นทุนเดิมโดยไม่ถอด VAT
  const costSubtotal=roundMoneyValue(costTotalAll);
  const costVatAmt=useCostVat===1?roundMoneyValue(costSubtotal*0.07):0;
  const costGrandTotal=roundMoneyValue(costSubtotal+costVatAmt);
  const costVatMode=useCostVat===1?'add':'none';
  const commMode=getCommMode('p');
  const commRate=parseMoney(document.getElementById('p-cr')?.value);
  const commAmt=commMode==='manual'?parseMoney(document.getElementById('p-ca')?.value):roundMoneyValue(saleVat.subtotal*commRate/100);
  // สูตรล่าสุด: กำไร = ยอดขายก่อน VAT - ยอดต้นทุนรวมจากรายการ - สวัสดิการ/ค่าคอมมิชชั่น
  // ไม่ใช้ costGrandTotal หรือต้นทุนที่บวก VAT ในการคำนวณกำไร
  const profit=roundMoneyValue(saleVat.subtotal-costTotalAll-commAmt);
  const values={
    'p-sale-raw':rawSaleTotal,
    'p-sub-total':saleVat.subtotal,
    'p-vat-total':saleVat.vatAmt,
    'p-total':saleVat.total,
    'p-cost-raw':costTotalAll,
    'p-cost-total':costTotalAll,
    'p-cost-subtotal':costSubtotal,
    'p-cost-vat-total':costVatAmt,
    'p-cost-grandtotal':costGrandTotal,
    'p-ca':commAmt,
    'p-profit':profit
  };
  Object.entries(values).forEach(([id,val])=>{
    const el=document.getElementById(id);if(!el)return;
    if(id==='p-ca'&&commMode==='manual')return;
    el.value=(val||rawSaleTotal||costTotalAll||commAmt)?fmt(val):'';
  });
  const pf=document.getElementById('p-profit');if(pf)pf.style.color=profit<0?'var(--red)':'var(--green)';
  return{
    itemTotal:saleVat.itemTotal,
    rawSaleTotal,
    subtotal:saleVat.subtotal,
    vat:saleVat.vatAmt,
    total:saleVat.total,
    useVat,
    vatMode:saleVat.vatMode,
    costRawTotal:costTotalAll,
    costTotal:costTotalAll,
    costSubtotal,
    costVat:costVatAmt,
    costGrandTotal,
    costUseVat:useCostVat,
    costVatMode,
    commMode,
    commRate,
    commAmt,
    profit
  };
}
function getPItems(){
  return Array.from(document.querySelectorAll('#p-items-body tr')).map(tr=>{
    const product=tr.querySelector('.p-product')?.value.trim()||'';
    const productMeta=productMasterMeta(product,tr.dataset.productCode||'',tr.dataset.productCategory||'');
    const qty=parseMoney(tr.querySelector('.p-qty')?.value);
    const unit=tr.querySelector('.p-unit')?.value||'';
    const costMode=tr.querySelector('.p-cost-mode')?.value==='lump'?'lump':'unit';
    const costRaw=String(tr.querySelector('.p-cost-value')?.value||'').trim();
    const costValue=parseMoney(costRaw);
    const costTotal=costMode==='lump'?costValue:qty*costValue;
    const saleRaw=String(tr.querySelector('.p-sale-value')?.value||'').trim();
    const saleValue=parseMoney(saleRaw);
    const saleTotal=qty*saleValue;
    return{
      product,productCode:productMeta.productCode,productCategory:productMeta.productCategory,flowType:productMeta.flowType,fulfillmentType:productMeta.fulfillmentType,qty,unit,costMode,costValue,costEntered:costRaw!=='',
      costUnit:costMode==='unit'?costValue:(qty>0?costTotal/qty:0),costLump:costMode==='lump'?costValue:0,costTotal,
      saleMode:'unit',saleValue,saleEntered:saleRaw!=='',priceUnit:saleValue,saleLump:0,saleTotal
    };
  }).filter(x=>x.product||x.qty||x.costEntered||x.saleEntered);
}
function getPCostSummary(p){
  const items=p.items||[];
  if(items.length===1){
    const it=items[0];
    if(it.costMode==='lump')return `เหมา ฿${fmt(it.costLump||it.costValue||it.costTotal||0)}`;
    return `฿${fmt(it.costUnit||it.costValue||0)} / ${it.unit||'หน่วย'}`;
  }
  const hasLump=items.some(it=>it.costMode==='lump');
  const hasUnit=items.some(it=>it.costMode!=='lump');
  if(hasLump&&hasUnit)return 'ผสม';
  if(hasLump)return 'ราคาเหมา';
  return p.costUnit?`฿${fmt(p.costUnit)} / หน่วย`:'-';
}
function getPSaleUnitValue(it){
  const qty=Number(it?.qty)||0;
  const total=Number(it?.saleTotal)||0;
  if(it?.saleMode==='lump')return qty>0?total/qty:Number(it?.priceUnit||0);
  return Number(it?.priceUnit ?? it?.saleValue ?? 0)||0;
}
function getPSaleSummary(p){
  const items=p.items||[];
  if(items.length===1){
    const it=items[0];
    return `฿${fmt(getPSaleUnitValue(it))} / ${it.unit||'หน่วย'}`;
  }
  return 'ราคาขายต่อหน่วย';
}
function productionSupplierCreditLabel(value,doc={}){
  const leadDays=normalizeProductionDeliveryLeadDays(doc?.deliveryLeadDays||doc?.shippingLeadDays);
  const explicitDays=resolveProductionSupplierCreditDays(value,leadDays);
  if(value==='deliveryLead')return leadDays?`เครดิตหลังส่งสินค้า ${leadDays} วัน (อิงระยะเวลาส่งสินค้า)`:'เครดิตหลังส่งสินค้าเท่ากับระยะเวลาส่งสินค้า';
  if(String(value||'').startsWith('lead'))return explicitDays?`เครดิตหลังส่งสินค้า ${explicitDays} วัน`:'เครดิตหลังส่งสินค้า';
  return {
    credit30:'เครดิตหลังส่งสินค้า 30 วัน',
    credit60:'เครดิตหลังส่งสินค้า 60 วัน',
    credit90:'เครดิตหลังส่งสินค้า 90 วัน',
    credit120:'เครดิตหลังส่งสินค้า 120 วัน',
    credit150:'เครดิตหลังส่งสินค้า 150 วัน',
    credit180:'เครดิตหลังส่งสินค้า 180 วัน',
    cash:'เงินสดเมื่อถึงกำหนดส่งสินค้า',
    deposit50:'จ่ายมัดจำ 50% วันที่สั่งผลิต'
  }[value]||'-';
}
function productionSupplierPaymentStatusLabel(value){
  return {
    pending:'รอการชำระสินค้า',
    partial:'ชำระบางส่วน',
    paid:'ชำระแล้ว'
  }[value]||'รอการชำระสินค้า';
}
function productionSupplierPaymentStatusBadge(value){
  if(value==='paid')return '<span class="badge b-green">✅ ชำระแล้ว</span>';
  if(value==='partial')return '<span class="badge b-blue">🟦 ชำระบางส่วน</span>';
  return '<span class="badge b-amber">⏳ รอการชำระสินค้า</span>';
}
function addDaysToIsoDate(dateStr,days){
  const parts=String(dateStr||'').split('-').map(Number);
  if(parts.length!==3||!parts[0]||!parts[1]||!parts[2]||!Number.isFinite(Number(days)))return'';
  const d=new Date(parts[0],parts[1]-1,parts[2],12,0,0,0);
  d.setDate(d.getDate()+Number(days));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const PRODUCTION_DELIVERY_LEAD_DAYS=[1,3,7,14,15,21,28,30,45,60];
const PRODUCTION_MAKER_PRESETS=[
  {name:'คอมฟอร์มกรุงเทพ',leadDays:[1,3,7,15,21],supplierCreditTerm:'credit60',note:'เครดิตผู้ผลิต 60 วัน'},
  {name:'จันชนา',leadDays:[30],supplierCreditTerm:'credit30',note:'เครดิตผู้ผลิต 30 วัน'},
  {name:'68 computer',leadDays:[7],supplierCreditTerm:'cash',note:'เงินสดเมื่อถึงกำหนดส่งสินค้า'},
  {name:'สุเทพการพิมพ์',leadDays:[14,21],supplierCreditTerm:'credit60',note:'เครดิตผู้ผลิต 60 วัน'},
  {name:'PK',leadDays:[14],supplierCreditTerm:'credit30',note:'เครดิตผู้ผลิต 30 วัน'},
  {name:'วิทยา',leadDays:[7,14],supplierCreditTerm:'credit30',note:'เครดิตผู้ผลิต 30 วัน'},
  {name:'เมดิแคร์พลัส',leadDays:[45,60],supplierCreditTerm:'credit60',note:'เครดิตผู้ผลิต 60 วัน'},
  {name:'เจ้าพระยา 41',leadDays:[14],supplierCreditTerm:'cash',note:'เงินสดเมื่อถึงกำหนดส่งสินค้า'},
  {name:'โพรดิวส์ลาเบล',leadDays:[14],supplierCreditTerm:'credit30',note:'เครดิตผู้ผลิต 30 วัน'},
  {name:'PW IT',leadDays:[7],supplierCreditTerm:'credit30',note:'เครดิตผู้ผลิต 30 วัน'},
  {name:'ยูนิ - สมาร์ท',leadDays:[7],supplierCreditTerm:'credit30',note:'เครดิตผู้ผลิต 30 วัน'}
];
function normalizeProductionMakerName(value){
  return String(value||'').toLowerCase().replace(/\s+/g,'').replace(/[.．]/g,'').replace(/[–—−]/g,'-').replace(/computer/g,'computer').trim();
}
function getProductionMakerPreset(name){
  const normalized=normalizeProductionMakerName(name);
  if(!normalized)return null;
  const saved=findContactMaster(name,'supplier');
  if(saved){
    const leadDays=(saved.supplierLeadDays||[]).map(Number).filter(day=>PRODUCTION_DELIVERY_LEAD_DAYS.includes(day));
    return{name:saved.name,leadDays:leadDays.length?leadDays:PRODUCTION_DELIVERY_LEAD_DAYS.slice(),supplierCreditTerm:saved.supplierCreditTerm||'deliveryLead',note:saved.note||'ข้อมูลจาก Supplier Master',fromMaster:true};
  }
  return PRODUCTION_MAKER_PRESETS.find(item=>normalizeProductionMakerName(item.name)===normalized)||null;
}
function productionMakerLeadOptions(makerName){
  const preset=getProductionMakerPreset(makerName);
  return preset?.leadDays?.length?preset.leadDays.slice():PRODUCTION_DELIVERY_LEAD_DAYS.slice();
}
function populateProductionMakerDatalist(){
  const list=document.getElementById('production-maker-options');
  if(!list)return;
  const names=[...new Set([...PRODUCTION_MAKER_PRESETS.map(item=>item.name),...contactMasterRows().filter(r=>contactHasRole(r,'supplier')).map(r=>r.name)])].filter(Boolean).sort((a,b)=>String(a).localeCompare(String(b),'th'));
  list.innerHTML=names.map(name=>`<option value="${escapeHtml(name)}"></option>`).join('');
}
function populateProductionDeliveryLeadOptions(allowedDays=PRODUCTION_DELIVERY_LEAD_DAYS,selectedValue='',autoSelectSingle=false){
  const select=document.getElementById('p-delivery-lead-days');
  if(!select)return;
  const days=(Array.isArray(allowedDays)&&allowedDays.length?allowedDays:PRODUCTION_DELIVERY_LEAD_DAYS)
    .map(Number)
    .filter((day,index,arr)=>PRODUCTION_DELIVERY_LEAD_DAYS.includes(day)&&arr.indexOf(day)===index);
  const current=String(selectedValue||select.value||'');
  select.innerHTML='<option value="">เลือกระยะเวลาส่งสินค้า</option>'+days.map(day=>`<option value="${day}">${day} วัน</option>`).join('');
  if(days.includes(Number(current)))select.value=String(Number(current));
  else if(autoSelectSingle&&days.length===1)select.value=String(days[0]);
  else select.value='';
}
function renderProductionMakerPresetHint(preset){
  const hint=document.getElementById('p-maker-preset-hint');
  if(!hint)return;
  if(!preset){
    hint.innerHTML='พิมพ์ชื่อผู้ผลิตเองได้ ระบบจะเปิดระยะเวลาส่งสินค้าทุกตัวเลือก และให้เลือกเครดิตผู้ผลิตเอง';
    return;
  }
  hint.innerHTML=`เลือก <b>${escapeHtml(preset.name)}</b> · ระยะเวลาส่งสินค้า: <b>${preset.leadDays.map(day=>`${day} วัน`).join(' / ')}</b> · ${escapeHtml(preset.note)}`;
}
function applyProductionMakerPreset(options={}){
  const maker=document.getElementById('p-maker')?.value||'';
  const leadSelect=document.getElementById('p-delivery-lead-days');
  const creditSelect=document.getElementById('p-supplier-credit');
  const preset=getProductionMakerPreset(maker);
  const selectedLead=options.selectedLead!==undefined?options.selectedLead:(leadSelect?.value||'');
  populateProductionDeliveryLeadOptions(preset?.leadDays||PRODUCTION_DELIVERY_LEAD_DAYS,selectedLead,Boolean(preset));
  if(preset&&creditSelect&&!options.preserveCredit){
    creditSelect.value=preset.supplierCreditTerm;
  }
  renderProductionMakerPresetHint(preset);
  updateProductionDeliveryDueDate();
  updateProductionSupplierDueDate();
  return preset;
}
function handleProductionMakerChange(){
  applySupplierMasterToProduction();
  applyProductionMakerPreset({preserveCredit:false});
}
function getProductionMakerPresetMeta(makerName){
  const preset=getProductionMakerPreset(makerName);
  if(!preset)return{makerPresetMatched:false,makerPresetName:'',makerDeliveryLeadOptions:[],makerDefaultSupplierCreditTerm:''};
  return{
    makerPresetMatched:true,
    makerPresetName:preset.name,
    makerDeliveryLeadOptions:preset.leadDays.slice(),
    makerDefaultSupplierCreditTerm:preset.supplierCreditTerm
  };
}
function resolveProductionSupplierCreditDays(creditTerm,leadDays=0){
  const fixed={credit30:30,credit60:60,credit90:90,credit120:120,credit150:150,credit180:180,cash:0,deposit50:0};
  if(Object.prototype.hasOwnProperty.call(fixed,creditTerm))return fixed[creditTerm];
  if(creditTerm==='deliveryLead')return normalizeProductionDeliveryLeadDays(leadDays);
  const m=String(creditTerm||'').match(/^lead(\d+)$/);
  if(m)return normalizeProductionDeliveryLeadDays(Number(m[1]));
  return null;
}
function isProductionSupplierCreditAfterDelivery(creditTerm){
  return !['cash','deposit50'].includes(String(creditTerm||''));
}
function getProductionSupplierCreditBaseDate(orderDate,creditTerm,leadDays=0,deliveryDueDate=''){
  const deliveryBase=deliveryDueDate||calculateProductionDeliveryDueDate(orderDate,leadDays);
  if(creditTerm==='deposit50')return orderDate||'';
  if(creditTerm==='cash')return deliveryBase||orderDate||'';
  return deliveryBase||orderDate||'';
}
function diffIsoDateDays(startDate,endDate){
  const start=parseIsoLocalDate(startDate);
  const end=parseIsoLocalDate(endDate);
  if(!start||!end)return null;
  return Math.round((end.getTime()-start.getTime())/86400000);
}
function productionSupplierCreditFormulaLabel(doc={}){
  const creditTerm=doc?.supplierCreditTerm||'deliveryLead';
  const leadDays=normalizeProductionDeliveryLeadDays(doc?.deliveryLeadDays||doc?.shippingLeadDays);
  const creditDays=resolveProductionSupplierCreditDays(creditTerm,leadDays);
  if(creditTerm==='deposit50')return 'มัดจำ 50%: นับวันครบกำหนดจากวันที่สั่งผลิต';
  if(creditTerm==='cash')return 'เงินสด: กำหนดชำระเมื่อถึงกำหนดส่งสินค้า';
  if(!leadDays&&!doc?.deliveryDueDate&&!doc?.estimatedDeliveryDate)return 'ยังคำนวณไม่ได้ เพราะยังไม่ได้ระบุระยะเวลาหรือกำหนดส่งสินค้า';
  return `วันที่สั่งผลิต + ระยะเวลาส่งสินค้า ${leadDays||0} วัน + เครดิตผู้ผลิต ${Number.isFinite(creditDays)?creditDays:0} วัน`;
}
function calculateProductionSupplierDueDate(orderDate,creditTerm,leadDays=0,deliveryDueDate=''){
  const days=resolveProductionSupplierCreditDays(creditTerm,leadDays);
  const baseDate=getProductionSupplierCreditBaseDate(orderDate,creditTerm,leadDays,deliveryDueDate);
  if(!baseDate)return'';
  if(creditTerm==='cash'||creditTerm==='deposit50')return baseDate;
  return Number.isFinite(days)?addDaysToIsoDate(baseDate,days):'';
}
function updateProductionSupplierCreditHint(){
  const hint=document.getElementById('p-supplier-credit-hint');
  if(!hint)return;
  const leadDays=normalizeProductionDeliveryLeadDays(document.getElementById('p-delivery-lead-days')?.value||'');
  const creditTerm=document.getElementById('p-supplier-credit')?.value||'';
  const dueDate=document.getElementById('p-supplier-due-date')?.value||'';
  const termText=productionSupplierCreditLabel(creditTerm,{deliveryLeadDays:leadDays});
  const orderDate=document.getElementById('p-date')?.value||'';
  const deliveryDueDate=document.getElementById('p-delivery-due-date')?.value||calculateProductionDeliveryDueDate(orderDate,leadDays);
  const creditDays=resolveProductionSupplierCreditDays(creditTerm,leadDays);
  const baseDate=getProductionSupplierCreditBaseDate(orderDate,creditTerm,leadDays,deliveryDueDate);
  const totalDays=diffIsoDateDays(orderDate,dueDate);
  const formula=creditTerm==='deposit50'
    ? 'มัดจำ 50% จะครบกำหนดในวันที่สั่งผลิต'
    : creditTerm==='cash'
      ? 'เงินสดจะครบกำหนดเมื่อถึงกำหนดส่งสินค้า'
      : `เริ่มนับเครดิตหลังวันกำหนดส่งสินค้า${deliveryDueDate?` <b>${formatThaiDate(deliveryDueDate)}</b>`:''} แล้วบวกเครดิตอีก <b>${Number.isFinite(creditDays)?creditDays:0} วัน</b>`;
  hint.innerHTML=`ใช้เงื่อนไข <b>${escapeHtml(termText)}</b> · ${formula}${dueDate?` · วันครบกำหนดชำระผู้ผลิต <b>${formatThaiDate(dueDate)}</b>`:''}${Number.isFinite(totalDays)?` · รวม ${totalDays} วันนับจากวันที่สั่งผลิต`:''}`;
}
function updateProductionSupplierDueDate(){
  const orderDate=document.getElementById('p-date')?.value||'';
  const creditTerm=document.getElementById('p-supplier-credit')?.value||'deliveryLead';
  const leadDays=normalizeProductionDeliveryLeadDays(document.getElementById('p-delivery-lead-days')?.value||'');
  const deliveryDueDate=document.getElementById('p-delivery-due-date')?.value||calculateProductionDeliveryDueDate(orderDate,leadDays);
  const dueDate=document.getElementById('p-supplier-due-date');
  if(dueDate)dueDate.value=calculateProductionSupplierDueDate(orderDate,creditTerm,leadDays,deliveryDueDate);
  updateProductionSupplierCreditHint();
}
function normalizeProductionDeliveryLeadDays(value){
  const days=Number(value);
  return PRODUCTION_DELIVERY_LEAD_DAYS.includes(days)?days:0;
}
function productionDeliveryLeadLabel(value){
  const days=normalizeProductionDeliveryLeadDays(value);
  return days?`${days} วัน`:'-';
}
function calculateProductionDeliveryDueDate(orderDate,leadDays){
  const days=normalizeProductionDeliveryLeadDays(leadDays);
  return days?addDaysToIsoDate(orderDate,days):'';
}
function updateProductionDeliveryDueDate(){
  const orderDate=document.getElementById('p-date')?.value||'';
  const leadDays=document.getElementById('p-delivery-lead-days')?.value||'';
  const deliveryDate=document.getElementById('p-delivery-due-date');
  if(deliveryDate)deliveryDate.value=calculateProductionDeliveryDueDate(orderDate,leadDays);
  updateProductionSupplierDueDate();
}
function getProductionDeliveryDueDate(doc){
  return doc?.deliveryDueDate||doc?.estimatedDeliveryDate||doc?.deliveryDate||calculateProductionDeliveryDueDate(doc?.date,doc?.deliveryLeadDays||doc?.shippingLeadDays);
}
function getProductionSupplierDueDate(doc){
  const leadDays=doc?.deliveryLeadDays||doc?.shippingLeadDays;
  const calculated=calculateProductionSupplierDueDate(doc?.date,doc?.supplierCreditTerm||'deliveryLead',leadDays,getProductionDeliveryDueDate(doc));
  if(doc?.supplierDueDateOverride)return doc?.supplierDueDate||calculated;
  return calculated||doc?.supplierDueDate||'';
}
function getProductionSupplierCreditDays(doc={}){
  return resolveProductionSupplierCreditDays(doc.supplierCreditTerm||'deliveryLead',doc.deliveryLeadDays||doc.shippingLeadDays);
}
function parseIsoLocalDate(value){
  const parts=String(value||'').split('-').map(Number);
  if(parts.length!==3||!parts[0]||!parts[1]||!parts[2])return null;
  return new Date(parts[0],parts[1]-1,parts[2],0,0,0,0);
}
function productionSupplierDueInfo(doc){
  const status=doc?.supplierPaymentStatus||'pending';
  const dueDate=getProductionSupplierDueDate(doc);
  if(status==='paid')return{dueDate,days:null,state:'paid',rowClass:'production-row-paid',text:'ชำระแล้ว'};
  const due=parseIsoLocalDate(dueDate);
  if(!due)return{dueDate:'',days:null,state:'none',rowClass:'',text:'ไม่ระบุ'};
  const today=new Date();today.setHours(0,0,0,0);
  const days=Math.round((due.getTime()-today.getTime())/86400000);
  if(days<0)return{dueDate,days,state:'overdue',rowClass:'production-row-overdue',text:`เกินกำหนด ${Math.abs(days)} วัน`};
  if(days===0)return{dueDate,days,state:'dueToday',rowClass:'production-row-overdue',text:'ครบกำหนดวันนี้'};
  if(days<=7)return{dueDate,days,state:'dueSoon',rowClass:'production-row-due-soon',text:`ใกล้ครบกำหนด ${days} วัน`};
  return{dueDate,days,state:'normal',rowClass:'',text:`เหลือ ${days} วัน`};
}
function productionSupplierDueBadge(doc){
  const info=productionSupplierDueInfo(doc);
  if(info.state==='paid')return `<span class="production-due-badge due-paid">✅ ${escapeHtml(info.dueDate?formatThaiDate(info.dueDate):'ชำระแล้ว')}</span>`;
  if(info.state==='overdue'||info.state==='dueToday')return `<span class="production-due-badge due-overdue">🔴 ${escapeHtml(formatThaiDate(info.dueDate))}<small>${escapeHtml(info.text)}</small></span>`;
  if(info.state==='dueSoon')return `<span class="production-due-badge due-soon">🟠 ${escapeHtml(formatThaiDate(info.dueDate))}<small>${escapeHtml(info.text)}</small></span>`;
  if(info.state==='normal')return `<span class="production-due-badge due-normal">${escapeHtml(formatThaiDate(info.dueDate))}<small>${escapeHtml(info.text)}</small></span>`;
  return '<span class="badge b-gray">ไม่ระบุ</span>';
}
function productionSupplierPaymentStatusSelect(doc){
  const status=doc?.supplierPaymentStatus||'pending';
  return `<div class="production-payment-status-control">${productionSupplierPaymentStatusBadge(status)}<select onchange="updateProductionSupplierPaymentStatus('${doc.branch}',${doc._y},${doc._m},'${doc.id}',this.value)" aria-label="อัปเดตสถานะชำระผู้ผลิต"><option value="pending" ${status==='pending'?'selected':''}>รอการชำระสินค้า</option><option value="partial" ${status==='partial'?'selected':''}>ชำระบางส่วน</option><option value="paid" ${status==='paid'?'selected':''}>ชำระแล้ว</option></select></div>`;
}
async function updateProductionSupplierPaymentStatus(br,y,m,id,status){
  if(!['pending','partial','paid'].includes(status))return;
  const d=loadFor(br,Number(y),Number(m));
  const production=(d.productions||[]).find(x=>String(x.id)===String(id));
  if(!production){notify('ไม่พบรายการสั่งผลิตนี้');renderPList();return;}
  const old={
    supplierPaymentStatus:production.supplierPaymentStatus,
    supplierPaidAt:production.supplierPaidAt,
    supplierPaidBy:production.supplierPaidBy
  };
  const profile=getCurrentProfile();
  production.supplierPaymentStatus=status;
  production.supplierPaidAt=status==='paid'?new Date().toISOString():'';
  production.supplierPaidBy=status==='paid'?(profile?.email||profile?.uid||''):'';
  production.supplierCreditBaseDate=getProductionSupplierCreditBaseDate(production.date,production.supplierCreditTerm||'deliveryLead',production.deliveryLeadDays||production.shippingLeadDays,getProductionDeliveryDueDate(production));
  production.supplierDueDate=getProductionSupplierDueDate(production);
  production.supplierTotalDueDays=diffIsoDateDays(production.date,production.supplierDueDate);
  production.supplierCreditRule=isProductionSupplierCreditAfterDelivery(production.supplierCreditTerm||'deliveryLead')?'deliveryDueDate_plus_creditDays':'no_credit_days';
  saveFor(br,Number(y),Number(m),d);
  renderPList();
  if(window.FirebaseService?.updateBusinessDoc){
    try{
      await window.FirebaseService.updateBusinessDoc('productions',production.id,br,Number(y),Number(m),{
        supplierPaymentStatus:production.supplierPaymentStatus,
        supplierPaidAt:production.supplierPaidAt,
        supplierPaidBy:production.supplierPaidBy,
        supplierCreditBaseDate:production.supplierCreditBaseDate,
        supplierCreditStartDate:production.supplierCreditBaseDate,
        supplierCreditRule:production.supplierCreditRule,
        supplierTotalDueDays:production.supplierTotalDueDays,
        supplierDueDate:production.supplierDueDate
      },production.firebaseId||'');
      scheduleCloudSync(Number(y));
    }catch(err){
      console.error('Firebase update supplier payment status error:',err);
      Object.assign(production,old);
      saveFor(br,Number(y),Number(m),d);
      renderPList();
      notify('อัปเดตสถานะชำระผู้ผลิตบน Firebase ไม่สำเร็จ ระบบย้อนสถานะกลับแล้ว');
    }
  }
}
async function linkQuoteToChild(sourceQuote,childType,childRecord){
  if(!sourceQuote||!childRecord)return false;
  const d=loadFor(sourceQuote.b,Number(sourceQuote.y),Number(sourceQuote.m));
  const q=(d.quotes||[]).find(x=>String(x.id)===String(sourceQuote.id)||String(x.no)===String(sourceQuote.no));
  if(!q)return false;
  const patch={workflowUpdatedAt:new Date().toISOString()};
  if(childType==='production'){
    Object.assign(patch,{productionId:childRecord.id,productionNo:childRecord.no,productionStatus:'created'});
  }else if(childType==='invoice'){
    Object.assign(patch,{invoiceId:childRecord.id,invoiceNo:childRecord.no,invoiceStatus:'created'});
  }
  Object.assign(q,patch);saveFor(sourceQuote.b,Number(sourceQuote.y),Number(sourceQuote.m),d);
  if(window.FirebaseService?.updateBusinessDoc){
    try{await window.FirebaseService.updateBusinessDoc('quotes',q.id,sourceQuote.b,Number(sourceQuote.y),Number(sourceQuote.m),patch,q.firebaseId||sourceQuote.firebaseId||'');}
    catch(err){console.error('Firebase update quotation workflow link error:',err);}
  }
  return true;
}

async function saveProduction(){
  const b=getBr('p');if(!b)return;
  const state=editState.production;
  if(state&&b!==state.branch){notify('ไม่สามารถเปลี่ยนสาขาระหว่างแก้ไขรายการสั่งผลิตได้');return;}
  const no=document.getElementById('p-no').value.trim(),date=document.getElementById('p-date').value,maker=document.getElementById('p-maker').value.trim(),cust=document.getElementById('p-cust').value.trim(),job=document.getElementById('p-job').value.trim();
  const makerPreset=getProductionMakerPreset(maker);
  const makerPresetMeta=getProductionMakerPresetMeta(maker);
  const deliveryLeadDays=normalizeProductionDeliveryLeadDays(document.getElementById('p-delivery-lead-days')?.value||'');
  const deliveryDueDate=document.getElementById('p-delivery-due-date')?.value||calculateProductionDeliveryDueDate(date,deliveryLeadDays);
  const supplierCreditTerm=document.getElementById('p-supplier-credit')?.value||'deliveryLead';
  const supplierCreditDays=getProductionSupplierCreditDays({supplierCreditTerm,deliveryLeadDays});
  const supplierCreditBaseDate=getProductionSupplierCreditBaseDate(date,supplierCreditTerm,deliveryLeadDays,deliveryDueDate);
  const supplierDueDate=document.getElementById('p-supplier-due-date')?.value||calculateProductionSupplierDueDate(date,supplierCreditTerm,deliveryLeadDays,deliveryDueDate);
  const supplierTotalDueDays=diffIsoDateDays(date,supplierDueDate);
  const supplierPaymentStatus=document.getElementById('p-supplier-payment-status')?.value||'pending';
  const supplierPaymentNote=document.getElementById('p-supplier-payment-note')?.value.trim()||'';
  const items=getPItems();
  if(!no||!date||!maker||!cust||!job||!items.length){notify('กรุณากรอกเลขที่, วันที่, ผู้รับผลิต/ผู้สั่งผลิต, ลูกค้า, ชื่องาน และรายการสินค้าที่สั่งผลิต');return;}
  if(makerPreset&&deliveryLeadDays&&!makerPreset.leadDays.includes(deliveryLeadDays)){notify(`ระยะเวลาส่งสินค้าไม่ตรงกับผู้ผลิต ${makerPreset.name} กรุณาเลือกจากตัวเลือก: ${makerPreset.leadDays.map(day=>day+' วัน').join(', ')}`);return;}
  if(items.some(x=>!x.product||!x.qty||!x.costEntered||!x.saleEntered||x.saleValue<=0)){notify('กรุณากรอกชื่อสินค้า จำนวน ราคาต้นทุน และราคาขายที่มากกว่า 0 ให้ครบทุกแถว');return;}
  const stockItems=items.filter(x=>x.fulfillmentType==='stock');
  if(stockItems.length&&!confirm(`พบสินค้า ${stockItems.length} รายการที่ Product Master กำหนดเป็น “สินค้าในสต็อก”
${stockItems.map(x=>'• '+x.product).join('\n')}

ตาม Workflow ปกติสินค้ากลุ่มนี้ไม่จำเป็นต้องผ่านใบสั่งผลิต ต้องการบันทึกเป็นงานผลิตต่อหรือไม่?`))return;
  const totals=calcP();const{year,month}=dateToYM(date);
  const original=state?.original||{};
  const sourceQuote=getSelectedQuoteRef('p');const sourceQuoteDoc=sourceQuote?loadQuoteRef(sourceQuote)?.q:null;
  let productionRecord={
    id:state?original.id:Date.now(),schemaVersion:3,no,date:isoDateCEFromValue(date),maker,makerAddress:document.getElementById('p-maker-address')?.value.trim()||'',makerTaxId:document.getElementById('p-maker-tax-id')?.value.trim()||'',makerContact:document.getElementById('p-maker-contact')?.value.trim()||'',makerPhone:document.getElementById('p-maker-phone')?.value.trim()||'',makerEmail:document.getElementById('p-maker-email')?.value.trim()||'',...makerPresetMeta,customer:cust,...getCustomerAgencyFromForm('p'),job,items,
    sourceQuoteId:sourceQuote?.id||original.sourceQuoteId||'',sourceQuoteNo:sourceQuote?.no||original.sourceQuoteNo||'',sourceQuoteBranch:sourceQuote?.b||original.sourceQuoteBranch||'',sourceQuoteYear:sourceQuote?.y??original.sourceQuoteYear??'',sourceQuoteMonth:sourceQuote?.m??original.sourceQuoteMonth??'',sourceQuoteFirebaseId:sourceQuoteDoc?.firebaseId||original.sourceQuoteFirebaseId||'',
    qty:items.reduce((sum,x)=>sum+x.qty,0),unit:items.length===1?items[0].unit:'',
    costMode:items.length===1?items[0].costMode:'mixed',costValue:items.length===1?items[0].costValue:0,costUnit:items.length===1?items[0].costUnit:0,costLump:items.length===1?items[0].costLump:0,costTotal:totals.costTotal,
    costSubtotal:totals.costSubtotal,costUseVat:totals.costUseVat,costVatMode:totals.costVatMode,costVatAmt:totals.costVat,costGrandTotal:totals.costGrandTotal,
    saleMode:'unit',saleValue:items.length===1?items[0].saleValue:0,priceUnit:items.length===1?items[0].priceUnit:0,saleLump:0,itemSaleTotal:totals.itemTotal,saleTotal:totals.itemTotal,
    subtotal:totals.subtotal,useVat:totals.useVat,vatMode:totals.vatMode,vatAmt:totals.vat,total:totals.total,
    commMode:totals.commMode,commRate:totals.commRate,commAmt:totals.commAmt,profit:totals.profit,
    deliveryLeadDays,deliveryDueDate,estimatedDeliveryDate:deliveryDueDate,shippingLeadDays:deliveryLeadDays,
    supplierCreditTerm,supplierCreditDays,supplierCreditSource:supplierCreditTerm==='deliveryLead'?'deliveryLeadDaysAfterDelivery':'afterDeliveryDueDate',supplierCreditBaseDate,supplierCreditStartDate:supplierCreditBaseDate,supplierCreditBaseSource:supplierCreditTerm==='deposit50'?'orderDate':'deliveryDueDate',supplierCreditRule:isProductionSupplierCreditAfterDelivery(supplierCreditTerm)?'deliveryDueDate_plus_creditDays':'no_credit_days',supplierTotalDueDays,supplierDueDate,supplierPaymentStatus,supplierPaymentNote,
    // Preserve invoice linkage while editing an existing production record.
    invoiceStatus:state?(original.invoiceStatus||'pending'):'pending',
    invoiceNo:state?(original.invoiceNo||''):'',
    invoiceId:state?(original.invoiceId||''):'',
    note:document.getElementById('p-note').value.trim(),attachments:attachedFiles['p-att']||[]
  };
  productionRecord=withThaiCalendarMeta(productionRecord,year,month);
  try{
    if(state){
      await commitDocumentEdit('production',productionRecord);
      rememberSupplierFromProduction(false);clearAttachedFiles('p-att');resetProduction();onYearChange();renderDash();renderPList();populateProductionRefs();
      notify('แก้ไขรายการสั่งผลิตสินค้าเรียบร้อย');
      return;
    }
    const d=loadFor(b,year,month);if(!d.productions)d.productions=[];
    d.productions.push(productionRecord);saveFor(b,year,month,d);
    if(sourceQuote)await linkQuoteToChild(sourceQuote,'production',productionRecord);
    saveCloudRecord('saveProduction',productionRecord,b,year,month,'สั่งผลิตสินค้า');
    rememberSupplierFromProduction(false);clearAttachedFiles('p-att');resetProduction();onYearChange();renderDash();renderPList();populateProductionRefs();notify('บันทึกสั่งผลิตสินค้าเรียบร้อย! สามารถดึงรายการนี้ไปสร้างใบส่งสินค้า / ใบกำกับภาษีได้');
  }catch(err){
    console.error('Save/edit production error:',err);
    notify('แก้ไขรายการสั่งผลิตไม่สำเร็จ: '+(err?.message||err));
  }
}
function resetProduction(){
  clearEditState('production');
  formBranch.p=null;['p-br-kk','p-br-ub'].forEach(id=>{const el=document.getElementById(id);if(el)el.className='br-opt';});document.getElementById('p-br-warn')?.classList.remove('show');
  ['p-no','p-maker','p-maker-address','p-maker-tax-id','p-maker-contact','p-maker-phone','p-maker-email','p-cust','p-job','p-sale-raw','p-sub-total','p-vat-total','p-total','p-cost-raw','p-cost-total','p-cost-subtotal','p-cost-vat-total','p-cost-grandtotal','p-cr','p-ca','p-profit','p-note','p-delivery-lead-days','p-delivery-due-date','p-supplier-credit','p-supplier-due-date','p-supplier-payment-note'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['p-source-quote-ref','p-quote-ref'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  applyCustomerAgencyToForm('p','');
  populateProductionDeliveryLeadOptions(PRODUCTION_DELIVERY_LEAD_DAYS,'',false);
  renderProductionMakerPresetHint(null);
  const date=document.getElementById('p-date');if(date)date.value=todayStr;
  const vat=document.querySelector('input[name="p-vat"][value="1"]');if(vat)vat.checked=true;
  const costVat=document.querySelector('input[name="p-cost-vat"][value="0"]');if(costVat)costVat.checked=true;
  const supplierCredit=document.getElementById('p-supplier-credit');if(supplierCredit)supplierCredit.value='deliveryLead';
  const supplierPayStatus=document.getElementById('p-supplier-payment-status');if(supplierPayStatus)supplierPayStatus.value='pending';
  updateProductionDeliveryDueDate();
  updateProductionSupplierDueDate();
  const commMode=document.getElementById('p-comm-mode');if(commMode)commMode.value='percent';toggleCommMode('p');
  clearAttachedFiles('p-att');const tb=document.getElementById('p-items-body');if(tb)tb.innerHTML='';addPItem({qty:1,unit:'กล่อง'});calcP();
}
function buildProductionInvoiceLinkMap(){
  const map=new Map();
  tenantActiveBranchIds().forEach(br=>allYears().forEach(y=>{for(let m=0;m<12;m++){
    const d=loadFor(br,y,m);(d.invoices||[]).forEach(inv=>{
      if(inv.sourceProductionId)map.set(`${inv.sourceProductionBranch||br}|${inv.sourceProductionId}`,{...inv,branch:br,_y:y,_m:m});
      if(inv.sourceProductionNo)map.set(`${inv.sourceProductionBranch||br}|no:${inv.sourceProductionNo}`,{...inv,branch:br,_y:y,_m:m});
    });
  }}));
  return map;
}
function renderPList(){
  const{branch,month,year,search}=getListFilters('pl');const paymentFilter=getElValue('pl-paystatus');const mVal=month===''?null:parseInt(month);const branches=branch?[branch]:tenantActiveBranchIds();let all=[];const mList=mVal===null?Array.from({length:12},(_,i)=>i):[mVal];
  branches.forEach(br=>mList.forEach(m=>{const d=loadFor(br,year,m);(d.productions||[]).forEach(x=>all.push({...x,branch:br,_m:m,_y:year}));}));
  all=dedupeForListDisplay(all);all.sort((a,b)=>b.id-a.id);if(search)all=all.filter(p=>(p.no||'').toLowerCase().includes(search)||(p.job||'').toLowerCase().includes(search)||(p.customer||'').toLowerCase().includes(search));
  if(paymentFilter){
    all=all.filter(p=>{
      const status=p.supplierPaymentStatus||'pending';
      const dueInfo=productionSupplierDueInfo(p);
      if(paymentFilter==='outstanding')return status!=='paid';
      if(paymentFilter==='dueSoon')return status!=='paid'&&dueInfo.state==='dueSoon';
      if(paymentFilter==='overdue')return status!=='paid'&&['overdue','dueToday'].includes(dueInfo.state);
      return status===paymentFilter;
    });
  }
  const linkMap=buildProductionInvoiceLinkMap();const empty=document.getElementById('pempty'),tbl=document.getElementById('ptbl');if(!tbl)return;empty.style.display=all.length?'none':'block';
  tbl.innerHTML=all.map(p=>{
    const linked=linkMap.get(`${p.branch}|${p.id}`)||linkMap.get(`${p.branch}|no:${p.no}`)||null;
    // รายการสั่งผลิตและการเชื่อมบิลใช้ต้นทุนดิบจากรายการ ไม่ใช้ต้นทุนรวมทั้งสิ้นที่บวก VAT
    const costTotal=safeNum(p.costTotal ?? p.costRawTotal)||(p.schemaVersion===2?0:safeNum(p.subtotal));
    const costGrand=safeNum(p.costGrandTotal)||(costTotal+safeNum(p.costVatAmt));
    const saleNet=safeNum(p.subtotal)||(p.schemaVersion===2?0:safeNum(p.total));
    const grand=safeNum(p.total)||saleNet;
    const dueInfo=productionSupplierDueInfo(p);
    return `<tr class="${dueInfo.rowClass}">
      <td><span class="badge b-blue">${escapeHtml(p.no||'-')}</span></td><td>${bbr(p.branch)}</td><td>${escapeHtml(formatThaiDate(p.date))}</td><td><b>${escapeHtml(p.maker||'-')}</b>${p.makerAddress?`<small style="display:block;margin-top:3px;color:var(--g3);max-width:220px;white-space:normal">${escapeHtml(p.makerAddress)}</small>`:''}</td><td>${escapeHtml(p.customer||'-')}</td><td>${escapeHtml(p.job||'-')}</td><td>${escapeHtml(productionDeliveryLeadLabel(p.deliveryLeadDays||p.shippingLeadDays))}</td><td>${escapeHtml(formatThaiDate(getProductionDeliveryDueDate(p))||'-')}</td>
      <td class="tn">฿${fmt(costTotal)}</td><td class="tn">฿${fmt(costGrand)}</td><td>${escapeHtml(productionSupplierCreditLabel(p.supplierCreditTerm,p))}</td><td>${productionSupplierDueBadge(p)}</td><td>${productionSupplierPaymentStatusSelect(p)}</td><td class="tn">฿${fmt(saleNet)}</td><td class="tn">฿${fmt(p.vatAmt)}</td><td class="tn"><b>฿${fmt(grand)}</b></td><td class="tn">฿${fmt(p.commAmt)}</td><td class="tn ${safeNum(p.profit)>=0?'pos':'neg'}">฿${fmt(p.profit)}</td>
      <td>${vatModeLabel(p)}</td>
      <td>${linked?`<span class="badge b-green">✅ ออกใบส่งสินค้าแล้ว ${escapeHtml(linked.no||'')}</span>`:'<span class="badge b-amber">⏳ ยังไม่ออกใบส่งสินค้า</span>'}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn btn-view btn-sm" onclick="showDetailById('production','${p.branch}',${p._y},${p._m},'${p.id}')">ดู</button>${!p.historicalSalesImport?`<button class="btn btn-amber btn-sm" title="แก้ไขรายการสั่งผลิต" onclick="editProduction('${p.branch}',${p._y},${p._m},'${p.id}')">✏️ แก้ไข</button>`:''}${(!linked&&!p.historicalSalesImport)?`<button class="btn btn-green btn-sm" onclick="useProductionForInvoice('${p.branch}',${p._y},${p._m},'${p.id}')">สร้างใบส่ง/ภาษี</button>`:''}<button class="btn btn-danger btn-sm" onclick="delDoc('${p.branch}',${p._y},${p._m},'productions',${p.id})">ลบ</button></td>
    </tr>`;
  }).join('');
}

// ============================================================
// EDIT EXISTING DOCUMENTS
// ============================================================
function setRadioValue(name,value){
  document.querySelectorAll(`input[name="${name}"]`).forEach(el=>{el.checked=String(el.value)===String(value);});
}
function editProduction(branch,year,month,id){
  const found=findLocalRecord('productions',branch,year,month,id);const p=found.record;
  if(!p){notify('ไม่พบรายการสั่งผลิตที่ต้องการแก้ไข');return;}
  if(p.historicalSalesImport){notify('รายการนี้เป็นข้อมูลยอดขายย้อนหลังจากการนำเข้า จึงไม่เปิดให้แก้ไขผ่านฟอร์มสั่งผลิต');return;}
  const linked=Boolean(p.invoiceId||p.invoiceNo||p.invoiceStatus==='issued');
  if(linked&&!confirm('รายการนี้เชื่อมกับใบส่งสินค้าแล้ว การแก้ไขรายการสั่งผลิตจะไม่แก้ใบส่งสินค้าที่ออกไปแล้วโดยอัตโนมัติ ต้องการดำเนินการต่อหรือไม่?'))return;
  resetProduction();
  applyBranchUi('p',branch);
  const savedLead=normalizeProductionDeliveryLeadDays(p.deliveryLeadDays||p.shippingLeadDays)||'';
  setInputValue('p-no',p.no);setInputValue('p-date',p.date);setInputValue('p-maker',p.maker);setInputValue('p-maker-address',p.makerAddress||'');setInputValue('p-maker-tax-id',p.makerTaxId||'');setInputValue('p-maker-contact',p.makerContact||'');setInputValue('p-maker-phone',p.makerPhone||'');setInputValue('p-maker-email',p.makerEmail||'');applyProductionMakerPreset({selectedLead:savedLead,preserveCredit:true});setInputValue('p-cust',p.customer);applyCustomerAgencyToForm('p',p);setInputValue('p-job',p.job);
  setInputValue('p-delivery-lead-days',savedLead);setInputValue('p-delivery-due-date',p.deliveryDueDate||p.estimatedDeliveryDate||getProductionDeliveryDueDate(p));
  setInputValue('p-supplier-credit',p.supplierCreditTerm||'deliveryLead');setInputValue('p-supplier-due-date',getProductionSupplierDueDate(p)||p.supplierDueDate||'');setInputValue('p-supplier-payment-status',p.supplierPaymentStatus||'pending');setInputValue('p-supplier-payment-note',p.supplierPaymentNote);setInputValue('p-note',p.note);
  setInputValue('p-comm-mode',p.commMode||'percent');setInputValue('p-cr',p.commRate||0);setInputValue('p-ca',p.commAmt||0);toggleCommMode('p');
  setRadioValue('p-vat',Number(p.useVat||0));setRadioValue('p-cost-vat',Number(p.costUseVat||0));
  const body=document.getElementById('p-items-body');if(body)body.innerHTML='';
  const sourceItems=Array.isArray(p.items)&&p.items.length?p.items:[{
    product:p.product||p.job||'',qty:p.qty||1,unit:p.unit||'กล่อง',costMode:p.costMode||'unit',costValue:p.costValue??p.costUnit??0,costUnit:p.costUnit??0,costLump:p.costLump??0,saleMode:p.saleMode||'unit',saleValue:p.saleValue??p.priceUnit??0,priceUnit:p.priceUnit??0,saleLump:p.saleLump??0
  }];
  sourceItems.forEach(addPItem);calcP();loadExistingAttachments('p-att',p.attachments);
  if(p.sourceQuoteNo){const ref={b:p.sourceQuoteBranch||branch,y:Number(p.sourceQuoteYear||year),m:Number(p.sourceQuoteMonth??month),id:p.sourceQuoteId||'',no:p.sourceQuoteNo,firebaseId:p.sourceQuoteFirebaseId||''};const hidden=document.getElementById('p-source-quote-ref');if(hidden)hidden.value=JSON.stringify(ref);populateQuoteRefs('p');}
  beginEditState('production',{type:'productions',branch,year:Number(year),month:Number(month),id:p.id,firebaseId:p.firebaseId||'',no:p.no,original:p});
  navToPanel('production-form');window.scrollTo({top:0,behavior:'smooth'});
}
function editQuote(branch,year,month,id){
  const found=findLocalRecord('quotes',branch,year,month,id);const q=found.record;
  if(!q){notify('ไม่พบใบเสนอราคาที่ต้องการแก้ไข');return;}
  resetF('quote');applyBranchUi('q',branch);setInputValue('q-no',q.no);setDocumentNumberValue('quote',q.no,{manual:true});setInputValue('q-date',q.date);setInputValue('q-cust',q.customer);applyCustomerAgencyToForm('q',q);setInputValue('q-address',q.customerAddress||q.address||'');setInputValue('q-tax-id',q.customerTaxId||'');setInputValue('q-contact',q.contact||'');setInputValue('q-phone',q.phone||'');setInputValue('q-email',q.email||'');setInputValue('q-sales',q.salesPerson);setInputValue('q-note',q.note);setInputValue('q-vat',Number(q.useVat||0));
  document.getElementById('q-items-body').innerHTML='';(q.items||[]).forEach(addQItem);if(!(q.items||[]).length)addQItem();calcQ();loadExistingAttachments('q-att',q.attachments);
  beginEditState('quote',{type:'quotes',branch,year:Number(year),month:Number(month),id:q.id,firebaseId:q.firebaseId||'',no:q.no,original:q});navToPanel('quote-form');window.scrollTo({top:0,behavior:'smooth'});
}
function editInvoice(branch,year,month,id){
  const found=findLocalRecord('invoices',branch,year,month,id);const inv=found.record;
  if(!inv){notify('ไม่พบใบส่งสินค้า / ใบกำกับภาษีที่ต้องการแก้ไข');return;}
  resetF('invoice');applyBranchUi('i',branch);setInputValue('i-no',inv.no);setDocumentNumberValue('invoice',inv.no,{manual:true});setInputValue('i-date',inv.date);setInputValue('i-cust',inv.customer);applyCustomerAgencyToForm('i',inv);setInputValue('i-address',inv.customerAddress||inv.address||'');setInputValue('i-tax-id',inv.customerTaxId||'');setInputValue('i-contact',inv.contact||'');setInputValue('i-phone',inv.phone||'');setInputValue('i-email',inv.email||'');setInputValue('i-sales',inv.salesPerson);setInputValue('i-credit-term',inv.creditTerm);setInputValue('i-due-date',inv.dueDate);setInputValue('i-vat',Number(inv.useVat||0));setInputValue('i-comm-mode',inv.commMode||'percent');setInputValue('i-cr',inv.commRate||0);setInputValue('i-ca',inv.commAmt||0);setInputValue('i-note',inv.note);
  toggleCommMode('i');document.getElementById('i-items-body').innerHTML='';(inv.items||[]).forEach(addIItem);if(!(inv.items||[]).length)addIItem();calcI();loadExistingAttachments('i-att',inv.attachments);
  const prodRef=document.getElementById('i-prod-ref');if(prodRef)prodRef.disabled=true;

  beginEditState('invoice',{type:'invoices',branch,year:Number(year),month:Number(month),id:inv.id,firebaseId:inv.firebaseId||'',no:inv.no,original:inv});navToPanel('invoice-form');window.scrollTo({top:0,behavior:'smooth'});
}
function editReceipt(branch,year,month,id){
  const found=findLocalRecord('receipts',branch,year,month,id);const r=found.record;
  if(!r){notify('ไม่พบใบเสร็จรับเงินที่ต้องการแก้ไข');return;}
  resetF('receipt');applyBranchUi('r',branch);setInputValue('r-no',r.no);setDocumentNumberValue('receipt',r.no,{manual:true});setInputValue('r-date',r.date);setInputValue('r-inv-no',r.invNo);setInputValue('r-sales',r.salesPerson);setInputValue('r-cust',r.customer);applyCustomerAgencyToForm('r',r);setInputValue('r-address',r.customerAddress||r.address||'');setInputValue('r-tax-id',r.customerTaxId||'');setInputValue('r-contact',r.contact||'');setInputValue('r-phone',r.phone||'');setInputValue('r-email',r.email||'');setInputValue('r-vat',Number(r.useVat||0));setInputValue('r-comm-mode',r.commMode||'percent');setInputValue('r-cr',r.commRate||0);setInputValue('r-ca',r.commAmt||0);setInputValue('r-note',r.note);
  toggleCommMode('r');document.getElementById('r-items-body').innerHTML='';(r.items||[]).forEach(it=>addRItem(it));if(!(r.items||[]).length)addRItem();calcR();loadExistingAttachments('r-att',r.attachments);
  const invRef=document.getElementById('r-inv-ref');if(invRef)invRef.disabled=true;
  beginEditState('receipt',{type:'receipts',branch,year:Number(year),month:Number(month),id:r.id,firebaseId:r.firebaseId||'',no:r.no,original:r});navToPanel('receipt-form');window.scrollTo({top:0,behavior:'smooth'});
}
async function commitDocumentEdit(type,newRecord){
  const state=editState[type];if(!state)return false;
  const oldFound=findLocalRecord(state.type,state.branch,state.year,state.month,state.id);
  if(!oldFound.record)throw new Error('ไม่พบข้อมูลเดิมในเครื่อง กรุณารีเฟรชแล้วลองใหม่');
  const newYM=dateToYM(newRecord.date);
  const original={...oldFound.record};
  const profile=getCurrentProfile();const merged=withThaiCalendarMeta({...original,...newRecord,id:original.id,firebaseId:original.firebaseId||state.firebaseId||'',updatedAtClient:new Date().toISOString(),lastEditedBy:profile?.uid||'',lastEditedByEmail:profile?.email||'',editCount:Number(original.editCount||0)+1},newYM.year,newYM.month);
  // ย้าย bucket localStorage เมื่อแก้วันที่ข้ามเดือน/ปี
  oldFound.list.splice(oldFound.index,1);saveFor(state.branch,state.year,state.month,oldFound.data);
  const target=loadFor(state.branch,newYM.year,newYM.month);target[state.type]=target[state.type]||[];target[state.type].push(merged);saveFor(state.branch,newYM.year,newYM.month,target);
  try{
    if(window.FirebaseService?.updateBusinessDoc){
      const result=await window.FirebaseService.updateBusinessDoc(state.type,original.id,state.branch,state.year,state.month,withThaiCalendarMeta({...merged,branch:state.branch},newYM.year,newYM.month),merged.firebaseId||'');
      if(!result?.updated)throw new Error('ไม่พบเอกสารใน Firebase ที่ต้องการอัปเดต');
    }
  }catch(err){
    // rollback local เมื่อ Firebase แก้ไขไม่สำเร็จ
    const rollbackTarget=loadFor(state.branch,newYM.year,newYM.month);rollbackTarget[state.type]=(rollbackTarget[state.type]||[]).filter(x=>String(x.id)!==String(merged.id));saveFor(state.branch,newYM.year,newYM.month,rollbackTarget);
    const rollbackOld=loadFor(state.branch,state.year,state.month);rollbackOld[state.type]=rollbackOld[state.type]||[];rollbackOld[state.type].push(original);saveFor(state.branch,state.year,state.month,rollbackOld);
    throw err;
  }
  clearEditState(type);scheduleCloudSync(newYM.year);return true;
}

// SAVE
// ============================================================
function dateToYM(dateStr){
  const d=parseFlexibleBusinessDate(dateStr);
  if(!d)throw new Error('วันที่ไม่ถูกต้อง');
  return{year:d.getFullYear(),month:d.getMonth()};
}

// ============================================================
// EDITABLE AUTO DOCUMENT NUMBERS
// รูปแบบเริ่มต้น: PREFIX + ปี พ.ศ. 2 หลัก + เดือน 2 หลัก + running number
// ผู้ใช้สามารถแก้เลขเองได้ และกด “ใช้เลขอัตโนมัติ” เพื่อกลับมาใช้ running number
// ============================================================
const AUTO_DOCUMENT_NUMBER_SPECS={
  quote:{prefix:'QT',collections:['quotes'],inputId:'q-no',dateId:'q-date'},
  invoice:{prefix:'INV',collections:['invoices'],inputId:'i-no',dateId:'i-date'},
  receipt:{prefix:'REC',collections:['receipts'],inputId:'r-no',dateId:'r-date'}
};
let autoDocumentNumberWrite=false;
function documentNumberPrefix(type,dateValue){
  const spec=AUTO_DOCUMENT_NUMBER_SPECS[type];if(!spec)return '';
  const d=parseFlexibleBusinessDate(dateValue)||now;
  const be=toBEYear(d.getFullYear());
  return `${spec.prefix}${String(be).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}`;
}
function documentNumberSequence(type,dateValue,excludeId=''){
  const spec=AUTO_DOCUMENT_NUMBER_SPECS[type];if(!spec)return 1;
  const d=parseFlexibleBusinessDate(dateValue)||now;
  const year=d.getFullYear(),month=d.getMonth(),prefix=documentNumberPrefix(type,d);
  let maxSeq=0;
  tenantActiveBranchIds().forEach(branch=>{
    const pack=loadFor(branch,year,month);
    spec.collections.forEach(collection=>{
      (pack[collection]||[]).forEach(row=>{
        if(excludeId!==''&&String(row.id)===String(excludeId))return;
        const no=String(row.no||row.docNo||'').trim().toUpperCase();
        if(!no.startsWith(prefix))return;
        const suffix=no.slice(prefix.length);
        if(!/^\d+$/.test(suffix))return;
        maxSeq=Math.max(maxSeq,Number(suffix)||0);
      });
    });
  });
  return maxSeq+1;
}
function getNextDocumentNumber(type,dateValue,excludeId=''){
  const seq=documentNumberSequence(type,dateValue,excludeId);
  return `${documentNumberPrefix(type,dateValue)}${String(seq).padStart(2,'0')}`;
}
function setDocumentNumberValue(type,value,{manual=false}={}){
  const spec=AUTO_DOCUMENT_NUMBER_SPECS[type];const el=document.getElementById(spec?.inputId||'');if(!el)return '';
  autoDocumentNumberWrite=true;el.value=String(value||'');autoDocumentNumberWrite=false;
  el.dataset.manualNumber=manual?'1':'0';el.dataset.autoNumber=manual?'0':'1';el.classList.toggle('document-number-manual',manual);
  return el.value;
}
function refreshAutoDocumentNumber(type,force=false){
  const spec=AUTO_DOCUMENT_NUMBER_SPECS[type];if(!spec)return '';
  const noEl=document.getElementById(spec.inputId),dateEl=document.getElementById(spec.dateId);if(!noEl||!dateEl)return '';
  const state=editState[type];
  if(state&&!force)return noEl.value;
  if(!force&&noEl.dataset.manualNumber==='1'&&noEl.value.trim())return noEl.value;
  return setDocumentNumberValue(type,getNextDocumentNumber(type,dateEl.value||todayStr,state?.id||''),{manual:false});
}
function useAutoDocumentNumber(type){
  const value=refreshAutoDocumentNumber(type,true);
  if(value)notify(`สร้างเลขเอกสารอัตโนมัติ ${value}`,'success',2200);
  scheduleInlineDocumentPreview?.(type==='quote'?'q':type==='invoice'?'i':'r');
  return value;
}
function handleDocumentDateChange(type){
  refreshAutoDocumentNumber(type,false);
  scheduleInlineDocumentPreview?.(type==='quote'?'q':type==='invoice'?'i':'r');
}
function initAutoDocumentNumberControls(){
  Object.entries(AUTO_DOCUMENT_NUMBER_SPECS).forEach(([type,spec])=>{
    const noEl=document.getElementById(spec.inputId);if(!noEl||noEl.dataset.autoNumberBound==='1')return;
    noEl.dataset.autoNumberBound='1';
    noEl.addEventListener('input',()=>{if(autoDocumentNumberWrite)return;noEl.dataset.manualNumber='1';noEl.dataset.autoNumber='0';noEl.classList.add('document-number-manual');});
    const dateEl=document.getElementById(spec.dateId);if(dateEl&&dateEl.dataset.autoNumberDateBound!=='1'){dateEl.dataset.autoNumberDateBound='1';dateEl.addEventListener('change',()=>handleDocumentDateChange(type));}
  });
  refreshAutoDocumentNumber('quote',false);refreshAutoDocumentNumber('invoice',false);refreshAutoDocumentNumber('receipt',false);
}
function refreshAutoQuoteNumber(force=false){return refreshAutoDocumentNumber('quote',force);}
function refreshAutoInvoiceNumber(force=false){return refreshAutoDocumentNumber('invoice',force);}
function refreshAutoReceiptNumber(force=false){return refreshAutoDocumentNumber('receipt',force);}
function documentNumberExists(type,no,excludeId=''){
  const spec=AUTO_DOCUMENT_NUMBER_SPECS[type];if(!spec||!String(no||'').trim())return false;
  const target=String(no).trim().toUpperCase();const years=[...new Set([...allYears(),now.getFullYear()])];
  for(const branch of tenantActiveBranchIds())for(const year of years)for(let month=0;month<12;month++){
    const pack=loadFor(branch,year,month);
    for(const collection of spec.collections){
      const found=(pack[collection]||[]).some(row=>{if(excludeId!==''&&String(row.id)===String(excludeId))return false;return String(row.no||row.docNo||'').trim().toUpperCase()===target;});
      if(found)return true;
    }
  }
  return false;
}

async function saveQuote(){
  const b=getBr('q');if(!b)return;
  const state=editState.quote;if(state&&b!==state.branch){notify('ไม่สามารถเปลี่ยนสาขาระหว่างแก้ไขเอกสารได้');return;}
  let no=document.getElementById('q-no').value.trim();const date=document.getElementById('q-date').value,cust=document.getElementById('q-cust').value.trim();
  if(!no)no=refreshAutoDocumentNumber('quote',true);
  if(!no||!date||!cust){notify('กรุณากรอกเลขที่, วันที่ และชื่อลูกค้า');return;}
  if(documentNumberExists('quote',no,state?.id||'')){notify(`เลขที่ใบเสนอราคา ${no} มีอยู่แล้ว กรุณาแก้ไขเลขหรือกด “ใช้เลขอัตโนมัติ”`);return;}
  const items=getQItems();if(!items.length){notify('กรุณาเพิ่มรายการสินค้า');return;}
  const sub=items.reduce((sum,item)=>sum+item.total,0),uv=parseInt(document.getElementById('q-vat').value),va=uv?sub*.07:0;
  let quoteRecord={id:state?.id||Date.now(),no,date:isoDateCEFromValue(date),customer:cust,customerAddress:document.getElementById('q-address')?.value.trim()||'',customerTaxId:document.getElementById('q-tax-id')?.value.trim()||'',contact:document.getElementById('q-contact')?.value.trim()||'',phone:document.getElementById('q-phone')?.value.trim()||'',email:document.getElementById('q-email')?.value.trim()||'',...getCustomerAgencyFromForm('q'),salesPerson:document.getElementById('q-sales').value.trim(),items,subtotal:sub,useVat:uv,vatAmt:va,total:sub+va,note:document.getElementById('q-note').value.trim(),attachments:attachedFiles['q-att']||[],approved:state?.original?.approved||false,businessRuleVersion:window.BusinessRulesService?.currentVersion?.()||1,businessRuleCode:`BR-${String(window.BusinessRulesService?.currentVersion?.()||1).padStart(3,'0')}`};
  {const ym=dateToYM(quoteRecord.date);quoteRecord=withThaiCalendarMeta(quoteRecord,ym.year,ym.month);}
  try{
    if(state){await commitDocumentEdit('quote',quoteRecord);notify('แก้ไขใบเสนอราคาเรียบร้อย');}
    else{const{year,month}=dateToYM(date);const d=loadFor(b,year,month);d.quotes.push(quoteRecord);saveFor(b,year,month,d);saveCloudRecord('saveQuote',quoteRecord,b,year,month,'ใบเสนอราคา');notify('บันทึกใบเสนอราคาเรียบร้อย!');}
    rememberCustomerFromForm('q',false);clearAttachedFiles('q-att');resetF('quote');onYearChange();renderDash();renderQLList();
  }catch(err){console.error(err);notify('แก้ไขใบเสนอราคาไม่สำเร็จ: '+(err?.message||err));}
}


function getSelectedProductionRef(){
  const value=document.getElementById('i-prod-ref')?.value||'';
  if(!value)return null;
  try{return JSON.parse(value);}catch(_){return null;}
}
async function linkProductionToInvoice(source,invoiceRecord){
  if(!source)return false;
  const d=loadFor(source.b,Number(source.y),Number(source.m));
  const production=(d.productions||[]).find(p=>String(p.id)===String(source.id)||p.no===source.no);
  if(!production)return false;
  production.invoiceStatus='created';production.invoiceNo=invoiceRecord.no;production.invoiceId=invoiceRecord.id;production.invoiceCreatedAt=new Date().toISOString();
  saveFor(source.b,Number(source.y),Number(source.m),d);
  if(window.FirebaseService?.updateBusinessDoc){
    window.FirebaseService.updateBusinessDoc('productions',production.id,source.b,Number(source.y),Number(source.m),{
      invoiceStatus:production.invoiceStatus,invoiceNo:production.invoiceNo,invoiceId:production.invoiceId,invoiceCreatedAt:production.invoiceCreatedAt
    },production.firebaseId||'').catch(err=>console.error('Firebase update production invoice link error:',err));
  }
  return true;
}
async function saveInvoice(){
  const b=getBr('i');if(!b)return;
  const state=editState.invoice;if(state&&b!==state.branch){notify('ไม่สามารถเปลี่ยนสาขาระหว่างแก้ไขเอกสารได้');return;}
  let no=document.getElementById('i-no').value.trim();const date=document.getElementById('i-date').value,cust=document.getElementById('i-cust').value.trim();
  if(!no)no=refreshAutoDocumentNumber('invoice',true);
  if(!no||!date||!cust){notify('กรุณากรอกเลขที่บิล, วันที่ และชื่อลูกค้า');return;}
  if(documentNumberExists('invoice',no,state?.id||'')){notify(`เลขที่ใบส่งสินค้า / ใบกำกับภาษี ${no} มีอยู่แล้ว กรุณาแก้ไขเลขหรือกด “ใช้เลขอัตโนมัติ”`);return;}
  const items=getIItems();if(!items.length){notify('กรุณาเพิ่มรายการสินค้า');return;}
  const rawSaleTotal=items.reduce((s,i)=>s+i.saleTotal,0),ct=items.reduce((s,i)=>s+i.costTotal,0);
  const useVat=parseInt(document.getElementById('i-vat')?.value||0),vat=calculateVatSummary(rawSaleTotal,useVat);
  const cr=parseFloat(document.getElementById('i-cr').value)||0,commMode=getCommMode('i'),comm=commMode==='manual'?parseMoney(document.getElementById('i-ca').value):vat.subtotal*cr/100;
  const sourceProduction=getSelectedProductionRef();
  const creditTerm=document.getElementById('i-credit-term')?.value||'';
  const dueDate=document.getElementById('i-due-date')?.value||calculateInvoiceDueDate(date,creditTerm);
  const{year,month}=dateToYM(date);const d=loadFor(b,year,month);
  const sourceProductionDoc=sourceProduction?loadProductionRef(sourceProduction)?.p:null;
  const sourceQuote=(sourceProductionDoc?.sourceQuoteNo)?{b:sourceProductionDoc.sourceQuoteBranch||b,y:sourceProductionDoc.sourceQuoteYear??year,m:sourceProductionDoc.sourceQuoteMonth??month,id:sourceProductionDoc.sourceQuoteId||'',no:sourceProductionDoc.sourceQuoteNo,firebaseId:sourceProductionDoc.sourceQuoteFirebaseId||''}:null;
  const sourceQuoteDoc=sourceQuote?loadQuoteRef(sourceQuote)?.q:null;
  let invoiceRecord={id:state?.id||Date.now(),no,date:isoDateCEFromValue(date),customer:cust,customerAddress:document.getElementById('i-address')?.value.trim()||'',customerTaxId:document.getElementById('i-tax-id')?.value.trim()||'',contact:document.getElementById('i-contact')?.value.trim()||'',phone:document.getElementById('i-phone')?.value.trim()||'',email:document.getElementById('i-email')?.value.trim()||'',...getCustomerAgencyFromForm('i'),salesPerson:document.getElementById('i-sales').value.trim(),creditTerm,dueDate,items,itemSaleTotal:vat.itemTotal,subtotal:vat.subtotal,useVat,vatMode:vat.vatMode,vatAmt:vat.vatAmt,total:vat.total,saleTotal:vat.itemTotal,costTotal:ct,commMode,commRate:cr,commAmt:comm,profit:vat.subtotal-ct-comm,paymentStatus:'pending',paid:false,isPaid:false,paidAt:'',paidBy:'',
    sourceProductionId:sourceProduction?.id||'',sourceProductionNo:sourceProduction?.no||'',sourceProductionBranch:sourceProduction?.b||'',sourceProductionYear:sourceProduction?.y??'',sourceProductionMonth:sourceProduction?.m??'',sourceProductionRawCostTotal:safeNum(sourceProductionDoc?.costTotal ?? sourceProductionDoc?.costRawTotal),
    sourceQuoteId:sourceQuote?.id||'',sourceQuoteNo:sourceQuote?.no||'',sourceQuoteBranch:sourceQuote?.b||'',sourceQuoteYear:sourceQuote?.y??'',sourceQuoteMonth:sourceQuote?.m??'',sourceQuoteFirebaseId:sourceQuoteDoc?.firebaseId||sourceQuote?.firebaseId||'',
    note:document.getElementById('i-note').value.trim(),attachments:attachedFiles['i-att']||[]};
  invoiceRecord=withThaiCalendarMeta(invoiceRecord,year,month);
  try{
    if(state){
      // รักษาสถานะชำระเงินและความสัมพันธ์เดิมไว้
      Object.assign(invoiceRecord,{paymentStatus:state.original.paymentStatus||invoiceRecord.paymentStatus,paid:!!state.original.paid,isPaid:!!state.original.isPaid,paidAt:state.original.paidAt||'',paidBy:state.original.paidBy||'',paidReceiptNo:state.original.paidReceiptNo||'',paidReceiptId:state.original.paidReceiptId||'',sourceProductionId:state.original.sourceProductionId||invoiceRecord.sourceProductionId,sourceProductionNo:state.original.sourceProductionNo||invoiceRecord.sourceProductionNo,sourceProductionBranch:state.original.sourceProductionBranch||invoiceRecord.sourceProductionBranch,sourceProductionYear:state.original.sourceProductionYear??invoiceRecord.sourceProductionYear,sourceProductionMonth:state.original.sourceProductionMonth??invoiceRecord.sourceProductionMonth,sourceQuoteId:state.original.sourceQuoteId||invoiceRecord.sourceQuoteId,sourceQuoteNo:state.original.sourceQuoteNo||invoiceRecord.sourceQuoteNo,sourceQuoteBranch:state.original.sourceQuoteBranch||invoiceRecord.sourceQuoteBranch,sourceQuoteYear:state.original.sourceQuoteYear??invoiceRecord.sourceQuoteYear,sourceQuoteMonth:state.original.sourceQuoteMonth??invoiceRecord.sourceQuoteMonth,sourceQuoteFirebaseId:state.original.sourceQuoteFirebaseId||invoiceRecord.sourceQuoteFirebaseId});
      await commitDocumentEdit('invoice',invoiceRecord);notify('แก้ไขใบส่งสินค้า / ใบกำกับภาษีเรียบร้อย');
    }else{
      d.invoices.push(invoiceRecord);saveFor(b,year,month,d);if(sourceProduction)await linkProductionToInvoice(sourceProduction,invoiceRecord);if(sourceQuote)await linkQuoteToChild(sourceQuote,'invoice',invoiceRecord);saveCloudRecord('saveInvoice',invoiceRecord,b,year,month,'ใบส่งสินค้า / ใบกำกับภาษี');notify(sourceProduction?'บันทึกใบส่งสินค้า / ใบกำกับภาษีและเชื่อมกับใบสั่งผลิตเรียบร้อย!':(sourceQuote?'บันทึกใบส่งสินค้า / ใบกำกับภาษีและเชื่อมกับใบเสนอราคาเรียบร้อย!':'บันทึกใบส่งสินค้า / ใบกำกับภาษีเรียบร้อย!'));
    }
    rememberCustomerFromForm('i',false);clearAttachedFiles('i-att');resetF('invoice');onYearChange();renderDash();renderPList();renderIList();
  }catch(err){console.error(err);notify('แก้ไขใบส่งสินค้า / ใบกำกับภาษีไม่สำเร็จ: '+(err?.message||err));}
}


function getSelectedInvoiceRef(){
  const value=document.getElementById('r-inv-ref')?.value||'';
  if(!value)return null;
  try{return JSON.parse(value);}catch(_){return null;}
}
function locateInvoiceReference(branch,invNo,selectedRef){
  if(selectedRef){
    const d=loadFor(selectedRef.b,Number(selectedRef.y),Number(selectedRef.m));
    const issued=(d.issuedInvoices||[]).find(x=>String(x.id)===String(selectedRef.id)||x.no===selectedRef.no);
    if(issued)return{inv:issued,d,b:selectedRef.b,y:Number(selectedRef.y),m:Number(selectedRef.m),collection:'issuedInvoices'};
    const inv=(d.invoices||[]).find(x=>String(x.id)===String(selectedRef.id)||x.no===selectedRef.no);
    if(inv)return{inv,d,b:selectedRef.b,y:Number(selectedRef.y),m:Number(selectedRef.m),collection:'invoices'};
  }
  if(!invNo)return null;
  const branches=branch?[branch]:tenantActiveBranchIds();
  for(const b of branches){for(const y of allYears()){for(let m=0;m<12;m++){
    const d=loadFor(b,y,m);
    const issued=(d.issuedInvoices||[]).find(x=>String(x.no||'').trim()===String(invNo).trim());
    if(issued)return{inv:issued,d,b,y,m,collection:'issuedInvoices'};
    const inv=(d.invoices||[]).find(x=>String(x.no||'').trim()===String(invNo).trim());
    if(inv)return{inv,d,b,y,m,collection:'invoices'};
  }}}
  return null;
}
async function markInvoicePaidByReceipt(branch,invNo,selectedRef,receiptRecord){
  const found=locateInvoiceReference(branch,invNo,selectedRef);if(!found)return{found:false,cloudOk:true};
  const{inv,d,b,y,m,collection='invoices'}=found;const profile=getCurrentProfile();
  inv.paid=true;inv.isPaid=true;inv.paymentStatus='paid';inv.paidAt=new Date().toISOString();inv.paidBy=profile?.email||profile?.uid||'';
  inv.paidReceiptNo=receiptRecord.no;inv.paidReceiptId=receiptRecord.id;inv.paymentSource='receipt';
  saveFor(b,y,m,d);
  let cloudOk=true;
  if(window.FirebaseService?.updateBusinessDoc){
    try{
      await window.FirebaseService.updateBusinessDoc(collection,inv.id,b,y,m,{
        paid:inv.paid,isPaid:inv.isPaid,paymentStatus:inv.paymentStatus,paidAt:inv.paidAt,paidBy:inv.paidBy,paidReceiptNo:inv.paidReceiptNo,paidReceiptId:inv.paidReceiptId,paymentSource:inv.paymentSource
      },inv.firebaseId||'');
      scheduleCloudSync(y);
    }catch(err){cloudOk=false;console.error('Firebase auto paid from receipt error:',err);}
  }
  renderIList();populateInvRefs();window.renderIssuedInvoiceList?.();
  return{found:true,cloudOk,collection};
}
async function saveReceipt(){
  const b=getBr('r');if(!b)return;
  const state=editState.receipt;if(state&&b!==state.branch){notify('ไม่สามารถเปลี่ยนสาขาระหว่างแก้ไขเอกสารได้');return;}
  let no=document.getElementById('r-no').value.trim();const date=document.getElementById('r-date').value,cust=document.getElementById('r-cust').value.trim();
  if(!no)no=refreshAutoDocumentNumber('receipt',true);
  if(!no||!date||!cust){notify('กรุณากรอกเลขที่, วันที่ และชื่อลูกค้า');return;}
  if(documentNumberExists('receipt',no,state?.id||'')){notify(`เลขที่ใบเสร็จ ${no} มีอยู่แล้ว กรุณาแก้ไขเลขหรือกด “ใช้เลขอัตโนมัติ”`);return;}
  const items=getRItems(),rawSaleTotal=items.reduce((s,i)=>s+i.saleTotal,0),ct=items.reduce((s,i)=>s+(i.costUnit||0)*(i.qty||0),0);
  const useVat=parseInt(document.getElementById('r-vat')?.value||0),vat=calculateVatSummary(rawSaleTotal,useVat);
  const cr=parseFloat(document.getElementById('r-cr').value)||0,commMode=getCommMode('r'),comm=commMode==='manual'?parseMoney(document.getElementById('r-ca').value):vat.subtotal*cr/100;
  const selectedInvoice=getSelectedInvoiceRef();const invNo=document.getElementById('r-inv-no').value.trim()||(selectedInvoice?.no||'');
  const{year,month}=dateToYM(date);const d=loadFor(b,year,month);
  let receiptRecord={id:state?.id||Date.now(),no,date:isoDateCEFromValue(date),invNo,invoiceId:selectedInvoice?.id||'',invoiceBranch:selectedInvoice?.b||b,invoiceYear:selectedInvoice?.y??'',invoiceMonth:selectedInvoice?.m??'',...getCustomerAgencyFromForm('r'),salesPerson:document.getElementById('r-sales').value.trim(),customer:cust,customerAddress:document.getElementById('r-address')?.value.trim()||'',customerTaxId:document.getElementById('r-tax-id')?.value.trim()||'',contact:document.getElementById('r-contact')?.value.trim()||'',phone:document.getElementById('r-phone')?.value.trim()||'',email:document.getElementById('r-email')?.value.trim()||'',items,itemSaleTotal:vat.itemTotal,subtotal:vat.subtotal,useVat,vatMode:vat.vatMode,vatAmt:vat.vatAmt,total:vat.total,saleTotal:vat.itemTotal,costTotal:ct,commMode,commRate:cr,commAmt:comm,profit:vat.subtotal-ct-comm,note:document.getElementById('r-note').value.trim(),attachments:attachedFiles['r-att']||[]};
  receiptRecord=withThaiCalendarMeta(receiptRecord,year,month);
  try{
    let paymentResult={found:false,cloudOk:true};
    if(state){
      Object.assign(receiptRecord,{invoiceId:state.original.invoiceId||receiptRecord.invoiceId,invoiceBranch:state.original.invoiceBranch||receiptRecord.invoiceBranch,invoiceYear:state.original.invoiceYear??receiptRecord.invoiceYear,invoiceMonth:state.original.invoiceMonth??receiptRecord.invoiceMonth});
      await commitDocumentEdit('receipt',receiptRecord);notify('แก้ไขใบเสร็จรับเงินเรียบร้อย');
    }else{
      d.receipts.push(receiptRecord);saveFor(b,year,month,d);paymentResult=await markInvoicePaidByReceipt(b,invNo,selectedInvoice,receiptRecord);saveCloudRecord('saveReceipt',receiptRecord,b,year,month,'ใบเสร็จรับเงิน');
      const message=paymentResult.found?(paymentResult.cloudOk?'บันทึกใบเสร็จเรียบร้อย และปรับบิลอ้างอิงเป็น “ชำระเงินแล้ว” อัตโนมัติ':'บันทึกใบเสร็จและเปลี่ยนสถานะในเครื่องแล้ว แต่ส่งสถานะชำระเงินขึ้น Firebase ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ต/Rules'):(invNo?'บันทึกใบเสร็จเรียบร้อย แต่ไม่พบบิลอ้างอิง กรุณาตรวจเลขบิล':'บันทึกใบเสร็จรับเงินเรียบร้อย!');notify(message);
    }
    rememberCustomerFromForm('r',false);clearAttachedFiles('r-att');resetF('receipt');onYearChange();renderDash();renderIList();renderRList();populateInvRefs();
  }catch(err){console.error(err);notify('แก้ไขใบเสร็จรับเงินไม่สำเร็จ: '+(err?.message||err));}
}


function saveExpense(){
  const b=getBr('e');if(!b)return;
  const date=document.getElementById('e-date').value,desc=document.getElementById('e-desc').value.trim(),amount=parseFloat(document.getElementById('e-amount').value)||0;
  if(!date||!desc||!amount){notify('กรุณากรอกวันที่, รายละเอียด และจำนวนเงิน');return;}
  const{year,month}=dateToYM(date);
  const d=loadFor(b,year,month);
  const expenseRecord=withThaiCalendarMeta({
    id:Date.now(),
    date:isoDateCEFromValue(date),
    cat:document.getElementById('e-cat').value,
    vendor:getElValue('e-vendor'),
    desc,
    amount,
    by:document.getElementById('e-by').value.trim(),
    docType:getElValue('e-doc-type')||'receipt',
    taxStatus:getElValue('e-tax-status')||'requested',
    docNo:getElValue('e-doc-no'),
    purpose:getElValue('e-purpose')||'company',
    note:document.getElementById('e-note').value.trim(),
    attachments:attachedFiles['e-att']||[]
  },year,month);
  d.expenses.push(expenseRecord);
  saveFor(b,year,month,d);
  saveCloudRecord('saveExpense', expenseRecord, b, year, month, 'ค่าใช้จ่าย');
  clearAttachedFiles('e-att');resetF('expense');onYearChange();renderDash();renderEList();notify('บันทึกค่าใช้จ่ายเรียบร้อย!');
}

// ============================================================
// RESET FORMS
// ============================================================
function resetF(t){
  clearEditState(t);
  const f=t[0];formBranch[f]=null;
  document.getElementById(f+'-br-kk').className='br-opt';
  document.getElementById(f+'-br-ub').className='br-opt';
  document.getElementById(f+'-br-warn').classList.remove('show');
  if(t==='quote'){['q-cust','q-address','q-tax-id','q-contact','q-phone','q-email','q-sales','q-note'].forEach(id=>document.getElementById(id).value='');applyCustomerAgencyToForm('q','');document.getElementById('q-date').value=todayStr;document.getElementById('q-items-body').innerHTML='';['q-sub','q-vat-amt','q-total'].forEach(id=>document.getElementById(id).value='');clearAttachedFiles('q-att');setDocumentNumberValue('quote','',{manual:false});refreshAutoDocumentNumber('quote',true);}
  if(t==='invoice'){['i-no','i-cust','i-address','i-tax-id','i-contact','i-phone','i-email','i-sales','i-cr','i-note','i-credit-term','i-due-date'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});applyCustomerAgencyToForm('i','');const prodRef=document.getElementById('i-prod-ref');if(prodRef){prodRef.value='';prodRef.disabled=false;}const prodHint=document.getElementById('i-prod-link-hint');if(prodHint)prodHint.textContent='เลือกใบสั่งผลิตเพื่อเติมลูกค้า รายการสินค้า ราคาต้นทุนจากรายการ ราคาขาย VAT และค่าคอมมิชชั่นอัตโนมัติ โดยไม่ใช้ยอดต้นทุนรวมทั้งสิ้น';document.getElementById('i-comm-mode').value='percent';toggleCommMode('i');document.getElementById('i-vat').value='0';document.getElementById('i-date').value=todayStr;updateInvoiceDueDate();document.getElementById('i-items-body').innerHTML='';['i-st','i-vat-amt','i-grand-total','i-ct','i-ca','i-pf'].forEach(id=>document.getElementById(id).value='');clearAttachedFiles('i-att');setDocumentNumberValue('invoice','',{manual:false});refreshAutoDocumentNumber('invoice',true);populateProductionRefs();}
  if(t==='receipt'){['r-no','r-cust','r-address','r-tax-id','r-contact','r-phone','r-email','r-sales','r-inv-no','r-cr','r-note'].forEach(id=>document.getElementById(id).value='');applyCustomerAgencyToForm('r','');const rRef=document.getElementById('r-inv-ref');if(rRef){rRef.value='';rRef.disabled=false;}document.getElementById('r-comm-mode').value='percent';toggleCommMode('r');const rVat=document.getElementById('r-vat');if(rVat)rVat.value='0';document.getElementById('r-date').value=todayStr;document.getElementById('r-items-body').innerHTML='';['r-st','r-subtotal','r-vat-amt','r-grand-total','r-ct','r-ca','r-pf'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});clearAttachedFiles('r-att');setDocumentNumberValue('receipt','',{manual:false});refreshAutoDocumentNumber('receipt',true);populateInvRefs();}
  if(t==='expense'){['e-desc','e-by','e-note','e-vendor','e-doc-no'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('e-amount').value='';document.getElementById('e-date').value=todayStr;const cat=document.getElementById('e-cat');if(cat)cat.value='ค่าน้ำมันเชื้อเพลิง';const docType=document.getElementById('e-doc-type');if(docType)docType.value='receipt';const taxStatus=document.getElementById('e-tax-status');if(taxStatus)taxStatus.value='requested';const purpose=document.getElementById('e-purpose');if(purpose)purpose.value='company';clearAttachedFiles('e-att');refreshExpenseEvidenceUi();}
}

// ============================================================
// POPULATE PRODUCTION / INVOICE REFERENCES
// ============================================================
function quoteRefValue(b,y,m,q){return JSON.stringify({b,y,m,id:q.id,no:q.no,firebaseId:q.firebaseId||''});}
function getSelectedQuoteRef(prefix){
  const hidden=document.getElementById(prefix+'-source-quote-ref')?.value||'';
  const selected=document.getElementById(prefix+'-quote-ref')?.value||'';
  const value=selected||hidden;
  if(!value)return null;
  try{return JSON.parse(value);}catch(_){return null;}
}
function loadQuoteRef(ref){
  if(!ref)return null;
  const d=loadFor(ref.b,Number(ref.y),Number(ref.m));
  const q=(d.quotes||[]).find(x=>String(x.id)===String(ref.id)||String(x.no)===String(ref.no));
  return q?{q,d}:null;
}
function populateQuoteRefs(prefix){
  const sel=document.getElementById(prefix+'-quote-ref');if(!sel)return;
  const current=sel.value;sel.innerHTML='<option value="">-- เลือกใบเสนอราคา --</option>';
  const br=formBranch[prefix]||'';updateLinkedSourceBranchBadge(prefix+'-quote-source-branch',br);
  const branches=br?[br]:tenantActiveBranchIds();
  const filter=getLinkedRefFilters(prefix+'-quote');
  const years=Number.isFinite(filter.year)?[filter.year]:allYears();
  const months=filter.month===null?Array.from({length:12},(_,i)=>i):[filter.month];
  let shown=0,approved=0;
  branches.forEach(b=>years.forEach(y=>months.forEach(m=>{
    const d=loadFor(b,y,m);(d.quotes||[]).forEach(q=>{
      if(!refTextMatch(q,filter.search))return;
      shown++;if(q.approved)approved++;
      const o=document.createElement('option');o.value=quoteRefValue(b,y,m,q);
      o.textContent=`[${BRANCH_TH[b]}] ${q.no} | ${q.customer||'-'} | ${formatThaiDate(q.date)} | ฿${fmt(q.total||0)} | ${q.approved?'✅ อนุมัติแล้ว':'⏳ รออนุมัติ'}`;
      sel.appendChild(o);
    });
  })));
  if([...sel.options].some(o=>o.value===current))sel.value=current;
  const hint=document.getElementById(prefix+'-quote-link-hint');
  if(hint&&!sel.value)hint.textContent=`พบใบเสนอราคา ${shown} รายการ (${approved} รายการอนุมัติแล้ว) จากช่วงที่เลือก${filter.search?` • ค้นหา: ${filter.search}`:''}`;
}
function quoteItemsForTransfer(q){
  return (q.items||[]).map(it=>enrichProductItem(it)).filter(it=>it.fulfillmentType==='made_to_order').map(it=>({
    product:it.product||'',productCode:it.productCode||'',productCategory:it.productCategory||'',flowType:it.flowType||'',fulfillmentType:it.fulfillmentType||'made_to_order',qty:safeNum(it.qty),unit:it.unit||'ชิ้น',priceUnit:safeNum(it.priceUnit),saleValue:safeNum(it.priceUnit),saleTotal:safeNum(it.total)||(safeNum(it.qty)*safeNum(it.priceUnit))
  }));
}
function fillProductionFromQuote(){
  const ref=getSelectedQuoteRef('p');if(!ref)return;
  const found=loadQuoteRef(ref);if(!found)return notify('ไม่พบใบเสนอราคาที่เลือก');
  const q=found.q;selBr('p',ref.b);
  const refJson=quoteRefValue(ref.b,Number(ref.y),Number(ref.m),q);
  const hidden=document.getElementById('p-source-quote-ref');if(hidden)hidden.value=refJson;
  const select=document.getElementById('p-quote-ref');if(select&&[...select.options].some(o=>o.value===refJson))select.value=refJson;
  setInputValue('p-cust',q.customer||'');applyCustomerAgencyToForm('p',q);
  if(!document.getElementById('p-job')?.value)setInputValue('p-job',`งานตามใบเสนอราคา ${q.no}`);
  const body=document.getElementById('p-items-body');if(body)body.innerHTML='';
  const items=quoteItemsForTransfer(q);
  if(!items.length){addPItem({product:'',qty:1,unit:'ชิ้น',priceUnit:0});notify('ใบเสนอราคานี้ไม่มีรายการที่ตั้งเป็น “สินค้าสั่งผลิต” กรุณาตรวจ Product Master ก่อนสร้างใบสั่งผลิต');}else items.forEach(it=>addPItem({...it,costMode:'unit',costValue:'',saleValue:it.priceUnit}));
  setRadioValue('p-vat',Number(q.useVat||0));calcP();
  const note=document.getElementById('p-note');if(note&&!note.value)note.value=`อ้างอิงใบเสนอราคา ${q.no}${q.note?` — ${q.note}`:''}`;
  const hint=document.getElementById('p-quote-link-hint');if(hint)hint.textContent=`เชื่อมกับ ${q.no} • ${q.customer||'-'} • ดึง ${items.length} รายการแล้ว กรุณากรอกผู้ผลิตและราคาต้นทุนก่อนบันทึก`;
}
function useQuoteForProduction(b,y,m,id){
  const nav=[...document.querySelectorAll('.nav-item')].find(el=>(el.getAttribute('onclick')||'').includes("production-form"));
  go('production-form',nav);selBr('p',b);populateQuoteRefs('p');
  const sel=document.getElementById('p-quote-ref');if(!sel)return;
  const option=[...sel.options].find(o=>{try{const r=JSON.parse(o.value);return String(r.id)===String(id)&&r.b===b&&Number(r.y)===Number(y)&&Number(r.m)===Number(m);}catch(_){return false;}});
  if(option){sel.value=option.value;fillProductionFromQuote();}
}
function productionRefValue(b,y,m,p){return JSON.stringify({b,y,m,id:p.id,no:p.no});}
function linkedFilterMonthOptionsReady(){
  ['i-prod-filter-month','r-inv-filter-month'].forEach(id=>{
    const el=document.getElementById(id);
    if(el&&el.options.length<=1)populateMonthSel(id,false);
  });
}
function updateLinkedSourceBranchBadge(id,branch){
  const el=document.getElementById(id);if(!el)return;
  el.textContent=branch?BRANCH_TH[branch]:'ทุกสาขา';
  el.classList.toggle('is-all',!branch);
}
function getLinkedRefFilters(prefix){
  linkedFilterMonthOptionsReady();
  const yRaw=document.getElementById(prefix+'-filter-year')?.value||'';
  const year=toCEYear(yRaw||now.getFullYear());
  const mRaw=document.getElementById(prefix+'-filter-month')?.value;
  const month=mRaw===''||mRaw===undefined||mRaw===null?null:parseInt(mRaw,10);
  const search=(document.getElementById(prefix+'-filter-search')?.value||'').trim().toLowerCase();
  return{year,month,search};
}
function refTextMatch(doc={},search=''){
  if(!search)return true;
  const items=Array.isArray(doc.items)?doc.items:[];
  const hay=[doc.no,doc.customer,doc.salesPerson,doc.job,doc.maker,doc.product,doc.note,...items.flatMap(it=>[it.product,it.unit])]
    .filter(v=>v!==undefined&&v!==null).join(' ').toLowerCase();
  return hay.includes(search);
}
function populateProductionRefs(){
  const sel=document.getElementById('i-prod-ref');if(!sel)return;
  const current=sel.value;sel.innerHTML='<option value="">-- เลือกใบสั่งผลิตเพื่อสร้างใบส่งสินค้า / ใบกำกับภาษี --</option>';
  const br=formBranch.i;updateLinkedSourceBranchBadge('i-prod-source-branch',br);
  const branches=br?[br]:tenantActiveBranchIds();const linkMap=buildProductionInvoiceLinkMap();
  const filter=getLinkedRefFilters('i-prod');
  const years=Number.isFinite(filter.year)?[filter.year]:allYears();
  const months=filter.month===null?Array.from({length:12},(_,i)=>i):[filter.month];
  let total=0,shown=0;
  branches.forEach(b=>years.forEach(y=>months.forEach(m=>{
    const d=loadFor(b,y,m);(d.productions||[]).filter(p=>!p.historicalSalesImport).forEach(p=>{
      total++;
      if(!refTextMatch(p,filter.search))return;
      shown++;
      const o=document.createElement('option');o.value=productionRefValue(b,y,m,p);
      const linkedInv=linkMap.get(`${b}|${p.id}`)||linkMap.get(`${b}|no:${p.no}`)||null;
      const linked=!!(p.invoiceStatus==='created'||p.invoiceNo||linkedInv);const linkedNo=p.invoiceNo||linkedInv?.no||'';
      const lead=p.deliveryLeadDays||p.shippingLeadDays;
      const leadText=lead?` | ส่ง ${lead} วัน`:'';
      o.textContent=`[${BRANCH_TH[b]}] ${p.no} | ${p.customer||'-'} | ${p.job||'-'}${leadText}${linked?` | ✅ ออกใบส่งสินค้าแล้ว ${linkedNo}`:' | ⏳ ยังไม่ออกใบส่งสินค้า'}`;
      o.disabled=linked;sel.appendChild(o);
    });
  })));
  if([...sel.options].some(o=>o.value===current))sel.value=current;
  const hint=document.getElementById('i-prod-link-hint');
  if(hint&&!sel.value)hint.textContent=`พบใบสั่งผลิต ${shown} รายการ จากช่วงที่เลือก${filter.search?` (ค้นหา: ${filter.search})`:''} — เลือกรายการเพื่อเติมลูกค้า รายการสินค้า ราคาต้นทุน ราคาขาย VAT และค่าคอมมิชชั่นอัตโนมัติ`;
}
function loadProductionRef(ref){
  if(!ref)return null;const d=loadFor(ref.b,Number(ref.y),Number(ref.m));
  const p=(d.productions||[]).find(x=>String(x.id)===String(ref.id)||x.no===ref.no);return p?{p,d}:null;
}
function getProductionRawCostValue(item,production){
  const qty=safeNum(item?.qty||production?.qty);
  const mode=item?.costMode==='lump'?'lump':(production?.costMode==='lump'?'lump':'unit');
  if(item && item.costValue!==undefined && item.costValue!==null)return safeNum(item.costValue);
  if(mode==='lump'){
    return safeNum(item?.costLump ?? item?.costTotal ?? production?.costLump ?? production?.costTotal);
  }
  const unit=safeNum(item?.costUnit ?? production?.costUnit);
  if(unit)return unit;
  const rawTotal=safeNum(item?.costTotal ?? production?.costTotal ?? production?.costRawTotal);
  return qty>0?rawTotal/qty:rawTotal;
}
function fillFromProduction(){
  const ref=getSelectedProductionRef();if(!ref)return;
  const found=loadProductionRef(ref);if(!found)return notify('ไม่พบใบสั่งผลิตที่เลือก');
  const p=found.p;selBr('i',ref.b);
  const prodSelect=document.getElementById('i-prod-ref');
  const refValue=productionRefValue(ref.b,Number(ref.y),Number(ref.m),p);
  if(prodSelect&&[...prodSelect.options].some(o=>o.value===refValue))prodSelect.value=refValue;
  document.getElementById('i-cust').value=p.customer||'';applyCustomerAgencyToForm('i',p);applyCustomerMasterToForm('i',p.customer||'');
  document.getElementById('i-vat').value=String(Number(p.useVat||0));
  document.getElementById('i-comm-mode').value=p.commMode||'percent';
  document.getElementById('i-cr').value=p.commRate||'';
  document.getElementById('i-ca').value=(p.commMode==='manual'&&p.commAmt)?String(p.commAmt):'';
  toggleCommMode('i');
  const body=document.getElementById('i-items-body');if(body)body.innerHTML='';
  const rawFallbackCost=safeNum(p.costTotal ?? p.costRawTotal);
  const items=(p.items||[]).length?p.items:[{
    product:p.job,qty:p.qty,unit:p.unit,costMode:p.costMode,
    costValue:p.costMode==='lump'?rawFallbackCost:(safeNum(p.costUnit)||(safeNum(p.qty)>0?rawFallbackCost/safeNum(p.qty):rawFallbackCost)),
    priceUnit:p.priceUnit||0,saleTotal:p.saleTotal||p.total
  }];
  items.forEach(it=>{
    const qty=safeNum(it.qty);
    const saleTotal=safeNum(it.saleTotal)||(qty*safeNum(it.priceUnit||it.saleValue));
    const effectivePrice=qty>0?saleTotal/qty:safeNum(it.priceUnit||it.saleValue);
    const costMode=it.costMode==='lump'?'lump':'unit';
    const rawCostValue=getProductionRawCostValue(it,p);
    addIItem({
      product:it.product||p.job,
      productCode:it.productCode||'',
      productCategory:it.productCategory||'',
      qty,
      unit:it.unit||p.unit,
      costMode,
      costValue:rawCostValue,
      priceUnit:effectivePrice
    });
  });
  const note=document.getElementById('i-note');if(note&&!note.value)note.value=`อ้างอิงใบสั่งผลิต ${p.no}${p.note?` — ${p.note}`:''}`;
  const hint=document.getElementById('i-prod-link-hint');if(hint)hint.textContent=`เชื่อมกับ ${p.no} • ใช้ต้นทุนจากรายการ ฿${fmt(safeNum(p.costTotal ?? p.costRawTotal))} • ไม่ใช้ยอดต้นทุนรวมทั้งสิ้น`;
  calcI();
}

function useProductionForInvoice(b,y,m,id){
  const nav=[...document.querySelectorAll('.nav-item')].find(el=>(el.getAttribute('onclick')||'').includes("invoice-form"));
  go('invoice-form',nav);selBr('i',b);populateProductionRefs();
  const sel=document.getElementById('i-prod-ref');if(!sel)return;
  const option=[...sel.options].find(o=>{try{const r=JSON.parse(o.value);return String(r.id)===String(id)&&r.b===b&&Number(r.y)===Number(y)&&Number(r.m)===Number(m);}catch(_){return false;}});
  if(option){sel.value=option.value;fillFromProduction();}
}
function populateInvRefs(){
  const sel=document.getElementById('r-inv-ref');if(!sel)return;
  const current=sel.value;sel.innerHTML='<option value="">-- เลือกจากบิลที่มี --</option>';
  const br=formBranch.r;updateLinkedSourceBranchBadge('r-inv-source-branch',br);
  const branches=br?[br]:tenantActiveBranchIds();
  const filter=getLinkedRefFilters('r-inv');
  const years=Number.isFinite(filter.year)?[filter.year]:allYears();
  const months=filter.month===null?Array.from({length:12},(_,i)=>i):[filter.month];
  let shown=0;
  branches.forEach(b=>years.forEach(y=>months.forEach(m=>{
    const d=loadFor(b,y,m);(d.invoices||[]).forEach(inv=>{
      if(!refTextMatch(inv,filter.search))return;
      shown++;
      const o=document.createElement('option');o.value=JSON.stringify({b,y,m,id:inv.id,no:inv.no});const paid=isInvoicePaid(inv);
      o.textContent=`[${BRANCH_TH[b]}] ${inv.no} | ${inv.customer||'-'} | ${inv.salesPerson||'-'} | ${formatThaiDate(inv.date)} | ${paid?'✅ ชำระแล้ว':'⏳ รอชำระ'}`;
      o.disabled=paid;sel.appendChild(o);
    });
  })));
  if([...sel.options].some(o=>o.value===current))sel.value=current;
  const hint=document.getElementById('r-inv-link-hint');
  if(hint&&!sel.value)hint.textContent=`พบใบส่งสินค้า / ใบกำกับภาษี ${shown} รายการ จากช่วงที่เลือก${filter.search?` (ค้นหา: ${filter.search})`:''} — เลือกบิลเพื่อเติมข้อมูลใบเสร็จรับเงินอัตโนมัติ`;
}
function fillFromInv(){
  const val=document.getElementById('r-inv-ref').value;if(!val)return;
  const ref=JSON.parse(val);const d=loadFor(ref.b,ref.y,ref.m);const inv=d.invoices.find(i=>String(i.id)===String(ref.id)||i.no===ref.no);if(!inv)return;
  selBr('r',ref.b);document.getElementById('r-inv-ref').value=val;
  document.getElementById('r-inv-no').value=inv.no;document.getElementById('r-cust').value=inv.customer;applyCustomerAgencyToForm('r',inv);setInputValue('r-address',inv.customerAddress||inv.address||'');setInputValue('r-tax-id',inv.customerTaxId||'');setInputValue('r-contact',inv.contact||'');setInputValue('r-phone',inv.phone||'');setInputValue('r-email',inv.email||'');document.getElementById('r-sales').value=inv.salesPerson||'';
  document.getElementById('r-comm-mode').value=inv.commMode||'percent';document.getElementById('r-cr').value=inv.commRate||'';document.getElementById('r-ca').value=inv.commMode==='manual'?(inv.commAmt||''):'';
  const rVat=document.getElementById('r-vat');if(rVat)rVat.value=String(Number(inv.useVat||0));toggleCommMode('r');
  document.getElementById('r-items-body').innerHTML='';(inv.items||[]).forEach(it=>addRItem(it));calcR();
}

// ============================================================
// RENDER LISTS (with search filters)
// ============================================================
function getListFilters(prefix){
  return{
    branch:document.getElementById(prefix+'-br')?.value||'',
    month:document.getElementById(prefix+'-month')?.value,
    year:parseInt(document.getElementById(prefix+'-year')?.value||now.getFullYear()),
    search:(document.getElementById(prefix+'-search')?.value||'').toLowerCase()
  };
}

function renderQLList(){
  const{branch,month,year,search}=getListFilters('ql');
  const mVal=month===''?null:parseInt(month);
  const branches=branch?[branch]:tenantActiveBranchIds();
  let all=[];
  const mList=mVal===null?Array.from({length:12},(_,i)=>i):[mVal];
  branches.forEach(br=>mList.forEach(m=>{const d=loadFor(br,year,m);(d.quotes||[]).forEach(x=>all.push({...x,branch:br,_m:m,_y:year}));}));
  all=dedupeForListDisplay(all);
  all.sort((a,b)=>b.id-a.id);
  if(search)all=all.filter(q=>q.no.toLowerCase().includes(search)||q.customer.toLowerCase().includes(search));
  document.getElementById('qempty').style.display=all.length?'none':'block';
  document.getElementById('qtbl').innerHTML=all.map(q=>`<tr>
    <td><span class="badge b-purple">${q.no}</span></td>
    <td>${bbr(q.branch)}</td><td>${formatThaiDate(q.date)}</td><td>${q.customer}</td><td>${q.salesPerson||'-'}</td>
    <td class="tn">฿${fmt(q.total)}</td>
    <td>${q.useVat?'<span class="badge b-blue">มี VAT</span>':'<span class="badge b-gray">ไม่มี</span>'}</td>
    <td><div>${q.approved?'<span class="qs-approved">✅ อนุมัติแล้ว</span>':'<span class="qs-pending">⏳ รออนุมัติ</span>'}</div>${q.productionNo?`<small style="display:block;margin-top:4px">🏭 ${escapeHtml(q.productionNo)}</small>`:''}${q.invoiceNo?`<small style="display:block;margin-top:2px">🚚 ${escapeHtml(q.invoiceNo)}</small>`:''}</td>
    <td><label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px"><input type="checkbox" ${q.approved?'checked':''} onchange="toggleApprove('${q.branch}',${q._y},${q._m},${q.id},this.checked)"> อนุมัติ</label></td>
    <td style="display:flex;gap:4px">
      <button class="btn btn-primary btn-sm" title="เปิดต้นฉบับ/สำเนาใบเสนอราคา และดาวน์โหลด PDF" onclick="window.openQuoteDocument?.('${q.branch}',${q._y},${q._m},'${q.id}')">📄 ต้นฉบับ/สำเนา/PDF</button>
      <button class="btn btn-sm" title="สร้างรายการสั่งผลิตจากใบเสนอราคานี้" onclick="useQuoteForProduction('${q.branch}',${q._y},${q._m},'${q.id}')">🏭 สั่งผลิต</button>
      <button class="btn btn-view btn-sm" title="ดูรายละเอียดข้อมูล" onclick="showDetailById('quote','${q.branch}',${q._y},${q._m},'${q.id}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
      <button class="btn btn-amber btn-sm" onclick="editQuote('${q.branch}',${q._y},${q._m},'${q.id}')">✏️ แก้ไข</button>
      <button class="btn btn-danger btn-sm" onclick="delDoc('${q.branch}',${q._y},${q._m},'quotes',${q.id})">ลบ</button>
    </td>
  </tr>`).join('');
}

function toggleApprove(br,y,m,id,val){
  const d=loadFor(br,y,m);
  const f=d.quotes.find(q=>String(q.id)===String(id));
  if(f){
    f.approved=val;
    saveFor(br,y,m,d);
    renderQLList();renderDash();
    if(window.FirebaseService?.updateBusinessDoc){
      window.FirebaseService.updateBusinessDoc('quotes',id,br,y,m,{approved:val},f.firebaseId||'')
        .catch(err=>{
          console.error('Firebase update approval error:',err);
          notify('อัปเดตสถานะอนุมัติบน Firebase ไม่สำเร็จ ข้อมูลอาจเห็นไม่ตรงกันในเครื่องอื่น');
        });
    }
  }
}


function invoiceCreditTermLabel(value){
  return {
    cash:'เงินสด',
    deposit50:'จ่ายมัดจำ 50%',
    credit30:'เครดิต 30 วัน',
    credit60:'เครดิต 60 วัน',
    credit90:'เครดิต 90 วัน',
    credit120:'เครดิต 120 วัน',
    credit150:'เครดิต 150 วัน',
    credit180:'เครดิต 180 วัน'
  }[value]||'-';
}
function calculateInvoiceDueDate(invoiceDate,creditTerm){
  const days={cash:0,deposit50:0,credit30:30,credit60:60,credit90:90,credit120:120,credit150:150,credit180:180}[creditTerm];
  return Number.isFinite(days)?addDaysToIsoDate(invoiceDate,days):'';
}
function updateInvoiceDueDate(){
  const invoiceDate=document.getElementById('i-date')?.value||'';
  const creditTerm=document.getElementById('i-credit-term')?.value||'';
  const dueDate=document.getElementById('i-due-date');
  if(dueDate)dueDate.value=calculateInvoiceDueDate(invoiceDate,creditTerm);
}
function getInvoiceDueDate(inv){
  return inv?.dueDate||calculateInvoiceDueDate(inv?.date,inv?.creditTerm);
}
function isInvoicePaid(inv){
  return inv?.paymentStatus === 'paid' || inv?.paid === true || inv?.isPaid === true;
}
function invoiceDueInfo(inv){
  const dueDate=getInvoiceDueDate(inv);
  if(isInvoicePaid(inv))return{dueDate,days:null,state:'paid',rowClass:'invoice-row-paid',text:'ชำระแล้ว'};
  const due=parseIsoLocalDate(dueDate);
  if(!due)return{dueDate:'',days:null,state:'none',rowClass:'',text:'ไม่ระบุ'};
  const today=new Date();today.setHours(0,0,0,0);
  const days=Math.round((due.getTime()-today.getTime())/86400000);
  if(days<0)return{dueDate,days,state:'overdue',rowClass:'invoice-row-overdue',text:`เกินกำหนด ${Math.abs(days)} วัน`};
  if(days===0)return{dueDate,days,state:'dueToday',rowClass:'invoice-row-overdue',text:'ครบกำหนดวันนี้'};
  if(days<=7)return{dueDate,days,state:'dueSoon',rowClass:'invoice-row-due-soon',text:`ใกล้ครบกำหนด ${days} วัน`};
  return{dueDate,days,state:'normal',rowClass:'',text:`เหลือ ${days} วัน`};
}
function invoiceDueBadge(inv){
  const info=invoiceDueInfo(inv);
  if(info.state==='paid')return `<span class="production-due-badge due-paid">✅ ${escapeHtml(info.dueDate?formatThaiDate(info.dueDate):'ชำระแล้ว')}</span>`;
  if(info.state==='overdue'||info.state==='dueToday')return `<span class="production-due-badge due-overdue">🔴 ${escapeHtml(formatThaiDate(info.dueDate))}<small>${escapeHtml(info.text)}</small></span>`;
  if(info.state==='dueSoon')return `<span class="production-due-badge due-soon">🟠 ${escapeHtml(formatThaiDate(info.dueDate))}<small>${escapeHtml(info.text)}</small></span>`;
  if(info.state==='normal')return `<span class="production-due-badge due-normal">${escapeHtml(formatThaiDate(info.dueDate))}<small>${escapeHtml(info.text)}</small></span>`;
  return '<span class="badge b-gray">ไม่ระบุ</span>';
}
function invoicePaymentText(inv){
  return isInvoicePaid(inv) ? 'ชำระเงินแล้ว' : 'รอชำระเงิน';
}
function invoicePaymentBadge(inv){
  return isInvoicePaid(inv)
    ? `<span class="badge b-green">✅ ชำระเงินแล้ว${inv?.paidReceiptNo?` • ${escapeHtml(inv.paidReceiptNo)}`:''}</span>`
    : '<span class="badge b-amber">⏳ รอชำระเงิน</span>';
}
function invoicePaymentChecked(inv){
  return isInvoicePaid(inv) ? 'checked' : '';
}
async function toggleInvoicePaid(br,y,m,id,checked){
  const paid=!!checked;
  const d=loadFor(br,y,m);
  const inv=(d.invoices||[]).find(x=>String(x.id)===String(id));
  if(!inv){
    notify('ไม่พบรายการบิลนี้ อาจถูกลบหรืออยู่คนละเดือน/ปี');
    renderIList();
    return;
  }

  const old={
    paid:inv.paid,
    isPaid:inv.isPaid,
    paymentStatus:inv.paymentStatus,
    paidAt:inv.paidAt,
    paidBy:inv.paidBy
  };
  const profile=getCurrentProfile();
  inv.paid=paid;
  inv.isPaid=paid;
  inv.paymentStatus=paid?'paid':'pending';
  inv.paidAt=paid?new Date().toISOString():'';
  inv.paidBy=paid?(profile?.email||profile?.uid||''):'';
  saveFor(br,y,m,d);
  renderIList();

  if(window.FirebaseService?.updateBusinessDoc){
    try{
      const result=await window.FirebaseService.updateBusinessDoc('invoices',id,br,y,m,{
        paid:inv.paid,
        isPaid:inv.isPaid,
        paymentStatus:inv.paymentStatus,
        paidAt:inv.paidAt,
        paidBy:inv.paidBy
      },inv.firebaseId||'');
      if(!result?.updated){
        console.warn('ไม่พบเอกสารบน Firebase ที่ต้องอัปเดตสถานะชำระเงิน:', {id,br,y,m});
      }
      scheduleCloudSync(y);
    }catch(err){
      console.error('Firebase update invoice payment status error:',err);
      Object.assign(inv,old);
      saveFor(br,y,m,d);
      renderIList();
      notify('อัปเดตสถานะชำระเงินบน Firebase ไม่สำเร็จ ระบบย้อนสถานะกลับแล้ว กรุณาตรวจ Firestore Rules และอินเทอร์เน็ต');
    }
  }
}

function pctFmt(n){return (Number.isFinite(Number(n))?Number(n):0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';}
function getInvoiceReportRows(inv){
  const items=(inv.items&&inv.items.length)?inv.items:[{product:'-',qty:0,unit:'',costUnit:0,priceUnit:0,costTotal:safeNum(inv.costTotal),saleTotal:safeNum(inv.itemSaleTotal ?? inv.saleTotal)}];
  const rawItemTotal=safeNum(inv.itemSaleTotal)||items.reduce((s,it)=>s+(safeNum(it.saleTotal)||safeNum(it.qty)*safeNum(it.priceUnit)),0)||safeNum(inv.saleTotal);
  const vatMode=resolveVatMode(inv);
  const subtotal=safeNum(inv.subtotal)||(vatMode==='extract'?rawItemTotal*100/107:rawItemTotal);
  const totalSaleWithVat=safeNum(inv.total)||(vatMode==='add'?subtotal*1.07:rawItemTotal);
  const totalComm=safeNum(inv.commAmt);
  return items.map((it,idx)=>{
    const qty=safeNum(it.qty);
    const costMode=it.costMode==='lump'?'lump':'unit';
    const legacyCostUnit=safeNum(it.costUnit);
    const costValue=safeNum(it.costValue ?? (costMode==='lump'?it.costLump:it.costUnit));
    const costTotal=safeNum(it.costTotal)||(costMode==='lump'?costValue:qty*(costValue||legacyCostUnit));
    const costUnit=costMode==='unit'?(costValue||legacyCostUnit):(qty>0?costTotal/qty:0);
    const priceUnit=safeNum(it.priceUnit);
    const saleTotal=safeNum(it.saleTotal)||qty*priceUnit;
    const share=rawItemTotal>0?saleTotal/rawItemTotal:(items.length?1/items.length:1);
    const grossWithVat=vatMode==='add'?totalSaleWithVat*share:saleTotal;
    const netExVat=vatMode==='extract'?saleTotal*100/107:(vatMode==='add'?saleTotal:grossWithVat);
    const commShare=totalComm*share;
    // กำไรต่อรายการ = ยอดขายหลังถอด VAT - ต้นทุนรวม - สวัสดิการ/ค่าคอมมิชชั่น
    const profit=roundMoneyValue(netExVat-costTotal-commShare);
    return{
      idx,
      product:it.product||'-',
      qty,
      unit:it.unit||'',
      costMode,
      costModeLabel:costMode==='lump'?'ราคาเหมา':'ราคาต้นทุนต่อหน่วย',
      costValue:costMode==='lump'?costTotal:costUnit,
      costUnit,
      costTotal,
      priceUnit,
      saleTotal,
      grossWithVat,
      netExVat,
      commShare,
      profit,
      // %กำไรต้นทุน = กำไร ÷ รวมต้นทุน × 100
      profitCostPct:costTotal>0?profit*100/costTotal:0,
      // %กำไรยอดขาย = กำไร ÷ ยอดขายหลังถอด VAT × 100
      profitSalePct:netExVat>0?profit*100/netExVat:0
    };
  });
}

function renderIList(){
  const{branch,month,year,search}=getListFilters('il');
  const paymentFilter=getElValue('il-paystatus');
  const q=(search||'').toLowerCase();
  const mVal=month===''?null:parseInt(month);
  const branches=branch?[branch]:tenantActiveBranchIds();
  let invoices=[];
  const mList=mVal===null?Array.from({length:12},(_,i)=>i):[mVal];
  branches.forEach(br=>mList.forEach(m=>{const d=loadFor(br,year,m);(d.invoices||[]).forEach(x=>invoices.push({...x,branch:br,_m:m,_y:year}));}));
  invoices=dedupeForListDisplay(invoices);
  invoices.sort((a,b)=>b.id-a.id);
  if(paymentFilter){
    invoices=invoices.filter(inv=>{
      const info=invoiceDueInfo(inv);
      if(paymentFilter==='outstanding')return !isInvoicePaid(inv);
      if(paymentFilter==='paid')return isInvoicePaid(inv);
      if(paymentFilter==='dueSoon')return !isInvoicePaid(inv)&&info.state==='dueSoon';
      if(paymentFilter==='overdue')return !isInvoicePaid(inv)&&['overdue','dueToday'].includes(info.state);
      return true;
    });
  }
  let rows=[];
  invoices.forEach(inv=>{
    getInvoiceReportRows(inv).forEach(item=>rows.push({inv,item}));
  });
  if(q){
    rows=rows.filter(({inv,item})=>[
      inv.no,inv.sourceProductionNo,inv.customer,inv.salesPerson,inv.date,BRANCH_TH[inv.branch],item.product,item.unit,invoicePaymentText(inv),invoiceCreditTermLabel(inv.creditTerm),getInvoiceDueDate(inv),invoiceDueInfo(inv).text
    ].some(v=>String(v||'').toLowerCase().includes(q)));
  }
  const empty=document.getElementById('iempty'),body=document.getElementById('itbl');
  if(!body)return;
  empty.style.display=rows.length?'none':'block';
  body.innerHTML=rows.map(({inv,item})=>{const dueInfo=invoiceDueInfo(inv);return `<tr class="${dueInfo.rowClass}">
    <td>${escapeHtml(formatThaiDate(inv.date))}</td>
    <td><span class="badge b-green">${escapeHtml(inv.no||'-')}</span></td>
    <td>${escapeHtml(inv.salesPerson||'-')}</td>
    <td>${escapeHtml(inv.customer||'-')}</td>
    <td>${escapeHtml(item.product)}${item.unit?` <span class="invoice-item-unit">(${escapeHtml(item.unit)})</span>`:''}</td>
    <td class="tn">${fmt(item.qty)}</td>
    <td>${escapeHtml(item.costModeLabel)}</td>
    <td class="tn">฿${fmt(item.costValue)}</td>
    <td class="tn">฿${fmt(item.costTotal)}</td>
    <td class="tn">฿${fmt(item.priceUnit)}</td>
    <td class="tn">฿${fmt(item.grossWithVat)}</td>
    <td class="tn">฿${fmt(item.netExVat)}</td>
    <td class="tn">฿${fmt(item.commShare)}</td>
    <td class="tn ${item.profit>=0?'pos':'neg'}">฿${fmt(item.profit)}</td>
    <td class="tn ${item.profit>=0?'pos':'neg'}">${pctFmt(item.profitCostPct)}</td>
    <td class="tn ${item.profit>=0?'pos':'neg'}">${pctFmt(item.profitSalePct)}</td>
    <td>${item.idx===0?escapeHtml(invoiceCreditTermLabel(inv.creditTerm)):''}</td>
    <td>${item.idx===0?invoiceDueBadge(inv):''}</td>
    <td>
      ${item.idx===0?`<label class="pay-toggle">${invoicePaymentBadge(inv)}<span class="pay-check"><input type="checkbox" ${invoicePaymentChecked(inv)} onchange="toggleInvoicePaid('${inv.branch}',${inv._y},${inv._m},'${inv.id}',this.checked)"> ชำระแล้ว</span></label>`:''}
    </td>
    <td style="display:flex;gap:4px">
      ${item.idx===0?`<button class="btn btn-primary btn-sm" title="เปิดต้นฉบับ/สำเนาใบส่งสินค้า / ใบกำกับภาษีสำหรับพิมพ์และ PDF" onclick="openDeliveryDocumentFromInvoice('${inv.branch}',${inv._y},${inv._m},'${inv.id}')">📄 ต้นฉบับ/สำเนา/PDF</button><button class="btn btn-view btn-sm" onclick="showDetailById('invoice','${inv.branch}',${inv._y},${inv._m},'${inv.id}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button><button class="btn btn-amber btn-sm" title="แก้ไขข้อมูล" onclick="editInvoice('${inv.branch}',${inv._y},${inv._m},'${inv.id}')">✏️ แก้ไข</button><button class="btn btn-sm" title="ออกใบเสร็จจากบิลนี้" onclick="issueReceiptFromInvoice('${inv.branch}',${inv._y},${inv._m},'${inv.id}')">🧾 ออกใบเสร็จ</button><button class="btn btn-danger btn-sm" onclick="delDoc('${inv.branch}',${inv._y},${inv._m},'invoices',${inv.id})">ลบ</button>`:''}
    </td>
  </tr>`;}).join('');
}



function showFullDocumentPreviewModal(moduleApi, draft, ref, tabs){
  if (!moduleApi?.buildInlineHtml) { notify('ไม่พบโมดูลเอกสารสำหรับแสดงตัวอย่าง'); return; }
  document.getElementById('doc-preview-modal-overlay')?.remove();
  let activeTab = tabs[0]?.id;
  const overlay = document.createElement('div');
  overlay.id = 'doc-preview-modal-overlay';
  overlay.className = 'doc-preview-modal-overlay';
  overlay.innerHTML = `<div class="doc-preview-modal">
    <div class="doc-preview-modal-head">
      <div class="doc-preview-modal-title">ตัวอย่างเอกสาร — หน้านี้คือสิ่งที่จะได้เมื่อดาวน์โหลด PDF</div>
      <button type="button" class="doc-preview-modal-close" aria-label="ปิด">✕ ปิด</button>
    </div>
    <div class="doc-preview-modal-tabs"></div>
    <div class="doc-preview-modal-body"><div class="doc-preview-modal-page"></div></div>
  </div>`;
  document.body.appendChild(overlay);
  const tabsBox = overlay.querySelector('.doc-preview-modal-tabs');
  const pageEl = overlay.querySelector('.doc-preview-modal-page');
  const renderTabs = () => {
    tabsBox.innerHTML = tabs.map(t => `<button type="button" data-tab="${t.id}" class="${t.id === activeTab ? 'active' : ''}">${t.label}</button>`).join('');
  };
  const render = () => {
    renderTabs();
    pageEl.innerHTML = moduleApi.buildInlineHtml(draft, ref, activeTab);
  };
  render();
  tabsBox.addEventListener('click', event => {
    const btn = event.target.closest('button[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    render();
  });
  const close = () => overlay.remove();
  overlay.querySelector('.doc-preview-modal-close').addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  const onEsc = event => { if (event.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
  document.addEventListener('keydown', onEsc);
}

function previewQuoteDocumentFromForm(mode){
  const b=getBr('q'); if(!b)return;
  const date=document.getElementById('q-date')?.value||todayStr;
  const customer=document.getElementById('q-cust')?.value.trim()||'';
  const no=(document.getElementById('q-no')?.value.trim()||refreshAutoQuoteNumber());
  const items=getQItems();
  if(!customer){notify('กรุณากรอกชื่อลูกค้าก่อนเปิดตัวอย่างใบเสนอราคา');return;}
  if(!items.length){notify('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ');return;}
  const subtotal=items.reduce((sum,item)=>sum+safeNum(item.total),0);
  const useVat=parseInt(document.getElementById('q-vat')?.value||0);
  const vatAmt=useVat?subtotal*.07:0;
  const ym=dateToYM(date);
  const draft={
    id:'preview-quote',no,date:isoDateCEFromValue(date),branch:b,customer,
    ...getCustomerAgencyFromForm('q'),
    salesPerson:document.getElementById('q-sales')?.value.trim()||'',items,
    subtotal,useVat,vatAmt,total:subtotal+vatAmt,
    note:document.getElementById('q-note')?.value.trim()||'',
    attachments:attachedFiles['q-att']||[],approved:false
  };
  if(!window.ComformQuotationDocument?.loadFromData){notify('ไม่พบโมดูลเอกสารใบเสนอราคา กรุณาโหลดหน้าเว็บใหม่');return;}
  const ref={b,y:ym.year,m:ym.month,previewOnly:true};
  if(mode==='modal'){
    showFullDocumentPreviewModal(window.ComformQuotationDocument,draft,ref,[{id:'original',label:'ต้นฉบับ/ORIGINAL'},{id:'copy',label:'สำเนา/COPY'}]);
    return;
  }
  window.ComformQuotationDocument.loadFromData(draft,ref);
}

function previewDeliveryDocumentFromForm(mode){
  const b=getBr('i'); if(!b)return;
  const no=document.getElementById('i-no')?.value.trim()||'';
  const date=document.getElementById('i-date')?.value||todayStr;
  const customer=document.getElementById('i-cust')?.value.trim()||'';
  const items=getIItems();
  if(!no||!customer){notify('กรุณากรอกเลขที่เอกสารและชื่อลูกค้าก่อนเปิดตัวอย่าง');return;}
  if(!items.length){notify('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ');return;}
  const useVat=parseInt(document.getElementById('i-vat')?.value||0);
  const ym=dateToYM(date);
  const sourceProduction=getSelectedProductionRef();
  const sourceQuote=getSelectedQuoteRef('i');
  const draft={
    id:'preview-invoice',no,date:isoDateCEFromValue(date),branch:b,customer,
    ...getCustomerAgencyFromForm('i'),
    salesPerson:document.getElementById('i-sales')?.value.trim()||'',
    dueDate:document.getElementById('i-due-date')?.value||'',
    creditTerm:document.getElementById('i-credit-term')?.value||'',
    items,useVat,note:document.getElementById('i-note')?.value.trim()||'',
    attachments:attachedFiles['i-att']||[],
    sourceProductionNo:sourceProduction?.no||'',sourceProductionId:sourceProduction?.id||'',
    sourceQuoteNo:sourceQuote?.no||'',sourceQuoteId:sourceQuote?.id||''
  };
  if(!window.ComformDeliveryTaxDocument?.loadFromInvoice){notify('ไม่พบโมดูลใบส่งสินค้า / ใบกำกับภาษี กรุณาโหลดหน้าเว็บใหม่');return;}
  const ref={b,y:ym.year,m:ym.month,id:draft.id,no:draft.no,previewOnly:true};
  if(mode==='modal'){
    showFullDocumentPreviewModal(window.ComformDeliveryTaxDocument,draft,ref,[{id:'original',label:'ต้นฉบับ/ORIGINAL'},{id:'copy',label:'สำเนา/COPY'},{id:'delivery-copy',label:'สำเนาใบส่งสินค้า'}]);
    return;
  }
  window.go?.('delivery-tax-doc',null);
  window.ComformDeliveryTaxDocument.loadFromInvoice(draft,ref);
}

function previewReceiptDocumentFromForm(mode){
  const b=getBr('r'); if(!b)return;
  const no=document.getElementById('r-no')?.value.trim()||'';
  const date=document.getElementById('r-date')?.value||todayStr;
  const customer=document.getElementById('r-cust')?.value.trim()||'';
  const items=getRItems();
  if(!no||!customer){notify('กรุณากรอกเลขที่ใบเสร็จและชื่อลูกค้าก่อนเปิดตัวอย่าง');return;}
  if(!items.length){notify('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ');return;}
  const useVat=parseInt(document.getElementById('r-vat')?.value||0);
  const ym=dateToYM(date);
  const selectedInvoice=getSelectedInvoiceRef();
  const invNo=document.getElementById('r-inv-no')?.value.trim()||(selectedInvoice?.no||'');
  const draft={
    id:'preview-receipt',no,date:isoDateCEFromValue(date),branch:b,customer,
    ...getCustomerAgencyFromForm('r'),
    salesPerson:document.getElementById('r-sales')?.value.trim()||'',
    invNo,invoiceId:selectedInvoice?.id||'',invoiceYear:selectedInvoice?.y??'',invoiceMonth:selectedInvoice?.m??'',
    items,useVat,note:document.getElementById('r-note')?.value.trim()||'',
    attachments:attachedFiles['r-att']||[]
  };
  if(!window.ComformReceiptDocument?.loadFromReceipt){notify('ไม่พบโมดูลเอกสารใบเสร็จรับเงิน กรุณาโหลดหน้าเว็บใหม่');return;}
  const ref={b,y:ym.year,m:ym.month,id:draft.id,no:draft.no,previewOnly:true};
  if(mode==='modal'){
    showFullDocumentPreviewModal(window.ComformReceiptDocument,draft,ref,[{id:'original',label:'ต้นฉบับ/ORIGINAL'},{id:'account-copy',label:'สำเนาบัญชี'},{id:'file-copy',label:'สำเนาเก็บหลักฐาน'}]);
    return;
  }
  window.go?.('receipt-doc',null);
  window.ComformReceiptDocument.loadFromReceipt(draft,ref);
}

function openDeliveryDocumentFromInvoice(branch,year,month,id){
  const d=loadFor(branch,Number(year),Number(month));
  const inv=(d.invoices||[]).find(x=>String(x.id)===String(id));
  if(!inv){notify('ไม่พบใบส่งสินค้า / ใบกำกับภาษีนี้');return;}
  if(!window.ComformDeliveryTaxDocument?.loadFromInvoice){notify('ไม่พบโมดูลเอกสารใบส่งสินค้า / ใบกำกับภาษี กรุณาโหลดหน้าเว็บใหม่แล้วลองอีกครั้ง');return;}
  window.go?.('delivery-tax-doc',null);
  window.ComformDeliveryTaxDocument.loadFromInvoice(inv,{b:branch,y:Number(year),m:Number(month),id:inv.id,no:inv.no});
}
function openReceiptDocumentFromReceipt(branch,year,month,id){
  const d=loadFor(branch,Number(year),Number(month));
  const receipt=(d.receipts||[]).find(x=>String(x.id)===String(id));
  if(!receipt){notify('ไม่พบใบเสร็จรับเงินนี้');return;}
  if(!window.ComformReceiptDocument?.loadFromReceipt){notify('ไม่พบโมดูลเอกสารใบเสร็จรับเงิน กรุณาโหลดหน้าเว็บใหม่แล้วลองอีกครั้ง');return;}
  window.go?.('receipt-doc',null);
  window.ComformReceiptDocument.loadFromReceipt(receipt,{b:branch,y:Number(year),m:Number(month),id:receipt.id,no:receipt.no});
}

function issueReceiptFromInvoice(branch,year,month,id){
  const d=loadFor(branch,Number(year),Number(month));
  const inv=(d.invoices||[]).find(x=>String(x.id)===String(id));
  if(!inv){notify('ไม่พบข้อมูลใบส่งสินค้า / ใบกำกับภาษีนี้');return;}
  const nav=[...document.querySelectorAll('.nav-item')].find(el=>(el.getAttribute('onclick')||'').includes("receipt-form"));
  go('receipt-form',nav||null);selBr('r',branch);
  const yearEl=document.getElementById('r-inv-filter-year');if(yearEl)yearEl.value=String(year);
  const monthEl=document.getElementById('r-inv-filter-month');if(monthEl)monthEl.value=String(month);
  populateInvRefs();
  const sel=document.getElementById('r-inv-ref');if(!sel)return;
  const option=[...sel.options].find(o=>{try{const r=JSON.parse(o.value);return String(r.id)===String(id)&&r.b===branch&&Number(r.y)===Number(year)&&Number(r.m)===Number(month);}catch(_){return false;}});
  if(option){sel.value=option.value;fillFromInv();}
  else{
    setInputValue('r-inv-no',inv.no||'');setInputValue('r-cust',inv.customer||'');applyCustomerAgencyToForm('r',inv);setInputValue('r-sales',inv.salesPerson||'');
    notify('เปิดฟอร์มใบเสร็จรับเงินแล้ว แต่ไม่พบตัวเลือกอ้างอิงในรายการ จึงเติมข้อมูลหลักให้แทน กรุณาตรวจสอบก่อนบันทึก');
  }
}

function renderRList(){
  const{branch,month,year,search}=getListFilters('rl');
  const mVal=month===''?null:parseInt(month);
  const branches=branch?[branch]:tenantActiveBranchIds();
  let all=[];
  const mList=mVal===null?Array.from({length:12},(_,i)=>i):[mVal];
  branches.forEach(br=>mList.forEach(m=>{const d=loadFor(br,year,m);(d.receipts||[]).forEach(x=>all.push({...x,branch:br,_m:m,_y:year}));}));
  all=dedupeForListDisplay(all);
  all.sort((a,b)=>b.id-a.id);
  if(search)all=all.filter(r=>r.no.toLowerCase().includes(search)||r.customer.toLowerCase().includes(search));
  document.getElementById('rempty').style.display=all.length?'none':'block';
  document.getElementById('rtbl').innerHTML=all.map(r=>`<tr>
    <td><span class="badge b-blue">${r.no}</span></td>
    <td>${bbr(r.branch)}</td><td>${formatThaiDate(r.date)}</td><td>${r.invNo||'-'}</td><td>${r.customer}</td><td>${r.salesPerson||'-'}</td>
    <td class="tn">฿${fmt(r.total ?? r.saleTotal)}</td>
    <td class="tn ${r.profit>=0?'pos':'neg'}">฿${fmt(r.profit)}</td>
    <td style="display:flex;gap:4px">
      <button class="btn btn-primary btn-sm" title="เปิดต้นฉบับ/สำเนาใบเสร็จรับเงินสำหรับพิมพ์และ PDF" onclick="openReceiptDocumentFromReceipt('${r.branch}',${r._y},${r._m},'${r.id}')">📄 ต้นฉบับ/สำเนา/PDF</button>
      <button class="btn btn-view btn-sm" onclick="showDetailById('receipt','${r.branch}',${r._y},${r._m},'${r.id}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
      <button class="btn btn-amber btn-sm" onclick="editReceipt('${r.branch}',${r._y},${r._m},'${r.id}')">✏️ แก้ไข</button>
      <button class="btn btn-danger btn-sm" onclick="delDoc('${r.branch}',${r._y},${r._m},'receipts',${r.id})">ลบ</button>
    </td>
  </tr>`).join('');
}


function issuedDocRows(type, prefix){
  const {branch,month,year,search}=getListFilters(prefix);
  const mVal=month===''?null:parseInt(month);
  const branches=branch?[branch]:tenantActiveBranchIds();
  const months=mVal===null?Array.from({length:12},(_,i)=>i):[mVal];
  let rows=[];
  branches.forEach(br=>months.forEach(m=>{
    const data=loadFor(br,year,m);
    (data[type]||[]).forEach(row=>rows.push({...row,branch:br,_m:m,_y:year}));
  }));
  rows=dedupeForListDisplay(rows).sort((a,b)=>Number(b.id||0)-Number(a.id||0));
  const q=String(search||'').toLowerCase();
  if(q) rows=rows.filter(row=>[row.no,row.date,row.customer,row.salesPerson,row.invNo,row.documentKind]
    .some(value=>String(value||'').toLowerCase().includes(q)));
  return rows;
}

function renderIssuedInvoiceList(){
  const rows=issuedDocRows('issuedInvoices','oil');
  const body=document.getElementById('oitbl');
  const empty=document.getElementById('oiempty');
  if(!body||!empty)return;
  empty.style.display=rows.length?'none':'block';
  body.innerHTML=rows.map(row=>`<tr>
    <td><span class="badge b-green">${escapeHtml(row.no||'-')}</span></td>
    <td>${bbr(row.branch)}</td><td>${escapeHtml(formatThaiDate(row.date))}</td>
    <td>${escapeHtml(row.customer||'-')}</td><td>${escapeHtml(row.salesPerson||'-')}</td>
    <td class="tn">฿${fmt(invoiceNetSales(row))}</td><td class="tn">฿${fmt(row.total??0)}</td>
    <td>${escapeHtml(row.sourceProductionNo||'-')}</td>
    <td style="display:flex;gap:4px"><button class="btn btn-view btn-sm" onclick="showIssuedDocumentDetail('issuedInvoices','${row.branch}',${row._y},${row._m},'${row.id}')">ดู</button><button class="btn btn-danger btn-sm" onclick="delDoc('${row.branch}',${row._y},${row._m},'issuedInvoices',${row.id})">ลบ</button></td>
  </tr>`).join('');
}

function renderIssuedReceiptList(){
  const rows=issuedDocRows('issuedReceipts','orl');
  const body=document.getElementById('ortbl');
  const empty=document.getElementById('orempty');
  if(!body||!empty)return;
  empty.style.display=rows.length?'none':'block';
  body.innerHTML=rows.map(row=>`<tr>
    <td><span class="badge b-blue">${escapeHtml(row.no||'-')}</span></td>
    <td>${bbr(row.branch)}</td><td>${escapeHtml(formatThaiDate(row.date))}</td>
    <td>${escapeHtml(row.invNo||'-')}</td><td>${escapeHtml(row.customer||'-')}</td><td>${escapeHtml(row.salesPerson||'-')}</td>
    <td class="tn">฿${fmt(row.total??row.saleTotal??0)}</td>
    <td style="display:flex;gap:4px"><button class="btn btn-view btn-sm" onclick="showIssuedDocumentDetail('issuedReceipts','${row.branch}',${row._y},${row._m},'${row.id}')">ดู</button><button class="btn btn-danger btn-sm" onclick="delDoc('${row.branch}',${row._y},${row._m},'issuedReceipts',${row.id})">ลบ</button></td>
  </tr>`).join('');
}

function showIssuedDocumentDetail(type,branch,year,month,id){
  const row=(loadFor(branch,year,month)[type]||[]).find(item=>String(item.id)===String(id));
  if(!row){notify('ไม่พบข้อมูลเอกสาร');return;}
  const isInvoice=type==='issuedInvoices';
  document.getElementById('modal-title').textContent=isInvoice?'ข้อมูลออกบิลใบส่งของ / ใบกำกับภาษี':'ข้อมูลออกใบเสร็จรับเงิน';
  const details=[
    ['เลขที่เอกสาร',row.no],['วันที่',formatThaiDate(row.date)],['สาขา',BRANCH_TH[row.branch]],['ลูกค้า',row.customer],
    ['พนักงานขาย',row.salesPerson],['เลขอ้างอิง',isInvoice?(row.sourceProductionNo||'-'):(row.invNo||'-')],
    ['ยอดก่อน VAT','฿'+fmt(invoiceNetSales(row))],['VAT 7%','฿'+fmt(row.vatAmt||0)],['ยอดรวม','฿'+fmt(row.total||0)],['หมายเหตุ',row.note||'-']
  ];
  document.getElementById('modal-body').innerHTML=details.map(([label,value])=>`<div class="detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value??'-')}</strong></div>`).join('');
  document.getElementById('detail-modal').classList.add('show');
}

function renderEList(){
  const{branch,month,year}=getListFilters('el');
  const mVal=month===''?null:parseInt(month);
  const branches=branch?[branch]:tenantActiveBranchIds();
  let all=[];
  const mList=mVal===null?Array.from({length:12},(_,i)=>i):[mVal];
  branches.forEach(br=>mList.forEach(m=>{const d=loadFor(br,year,m);(d.expenses||[]).forEach(x=>all.push({...x,branch:br,_m:m,_y:year}));}));
  all=dedupeForListDisplay(all);
  all.sort((a,b)=>b.id-a.id);
  document.getElementById('eempty').style.display=all.length?'none':'block';
  document.getElementById('etbl').innerHTML=all.map(e=>{
    const evidenceCount=(e.attachments||[]).length;
    const taxCls=expenseTaxStatusClass(e.taxStatus||'not_requested');
    return `<tr>
      <td>${escapeHtml(formatThaiDate(e.date))}</td><td>${bbr(e.branch)}</td>
      <td><span class="badge b-amber">${escapeHtml(e.cat||'-')}</span></td>
      <td>${escapeHtml(e.vendor||'-')}</td>
      <td class="expense-desc-cell"><b>${escapeHtml(e.desc||'-')}</b><small>${escapeHtml(expensePurposeLabel(e.purpose))}</small></td>
      <td><span class="expense-doc-pill">${escapeHtml(expenseDocTypeLabel(e.docType))}</span>${e.docNo?`<small class="expense-doc-no">${escapeHtml(e.docNo)}</small>`:''}</td>
      <td><span class="expense-status-pill ${taxCls}">${escapeHtml(expenseTaxStatusLabel(e.taxStatus||'not_requested'))}</span></td>
      <td><button class="btn btn-view btn-sm expense-evidence-view" onclick="showDetailById('expense','${e.branch}',${e._y},${e._m},${JSON.stringify(String(e.id))})">📷 ${evidenceCount} ไฟล์ · ดู</button></td>
      <td>${escapeHtml(e.by||'-')}</td>
      <td class="tn neg">฿${fmt(e.amount)}</td>
      <td><button class="btn btn-danger btn-sm" onclick="delDoc('${e.branch}',${e._y},${e._m},'expenses',${JSON.stringify(String(e.id))})">ลบ</button></td>
    </tr>`;
  }).join('');
}
async function delDoc(br,y,m,type,id){
  if(!confirm('ลบรายการนี้หรือไม่? ระบบจะเก็บสำเนาไว้ใน Recycle Bin เพื่อกู้คืนภายหลัง'))return;
  const d=loadFor(br,y,m);
  const found=(d[type]||[]).find(x=>String(x.id)===String(id));
  window.ERPProductionCore?.trashSnapshot?.(type,found,br,y,m);
  d[type]=(d[type]||[]).filter(x=>String(x.id)!==String(id));
  saveFor(br,y,m,d);
  renderDash();renderQLList();renderIList();renderRList();renderIssuedInvoiceList();renderIssuedReceiptList();renderEList();renderPList();

  if(window.FirebaseService?.deleteBusinessDoc){
    try{
      const result=await window.FirebaseService.deleteBusinessDoc(found?.storageCollection||type,id,br,y,m,found?.firebaseId||'');
      if(!result?.deleted){
        console.warn('ไม่พบเอกสารบน Firebase ที่ต้องลบ:', {type,id,br,y,m});
      }
      scheduleCloudSync(y);
    }catch(err){
      console.error('Firebase delete error:',err);
      notify('ลบจากเครื่องนี้แล้ว แต่ลบบน Firebase ไม่สำเร็จ รายการอาจกลับมาอีกเมื่อโหลดข้อมูลใหม่ กรุณาตรวจ Firestore Rules');
    }
  }
}

// ============================================================
// DETAIL MODAL
// ============================================================
function showDetailById(type, br, y, m, id){
  const collectionByType = {
    quote: 'quotes',
    invoice: 'invoices',
    receipt: 'receipts',
    production: 'productions',
    expense: 'expenses'
  };
  const collection = collectionByType[type];
  if(!collection){
    notify('ไม่พบประเภทรายการที่ต้องการดู');
    return;
  }

  const year = Number(y);
  const month = Number(m);
  const data = loadFor(br, year, month);
  const doc = (data[collection] || []).find(x =>
    String(x.id) === String(id) ||
    (x.firebaseId && String(x.firebaseId) === String(id))
  );

  if(!doc){
    notify('ไม่พบรายการนี้ อาจถูกลบหรืออยู่คนละเดือน/ปี');
    return;
  }

  showDetail(type, { ...doc, branch: br, _y: year, _m: month });
}

function showDetail(type,doc){
  document.getElementById('detail-modal').classList.add('open');
  let title='',body='';
  function dr(k,v){return`<div class="detail-row"><span class="dk">${k}</span><span class="dv">${v||'-'}</span></div>`;}
  function agencyDetailRows(row){const agency=customerAgencyForRecord(row);return dr('ประเภทหน่วยงาน',agency.customerAgencyGroupLabel)+dr('ประเภทย่อย',agency.customerAgencyTypeLabel);}

  if(type==='quote'){
    title=`📄 ใบเสนอราคา — ${doc.no}`;
    body=dr('เลขที่',doc.no)+dr('วันที่',formatThaiDate(doc.date))+dr('สาขา',BRANCH_TH[doc.branch]||'-')+dr('ลูกค้า',doc.customer)+dr('ที่อยู่ลูกค้า',doc.customerAddress||doc.address||'-')+dr('เลขผู้เสียภาษีลูกค้า',doc.customerTaxId||'-')+dr('ติดต่อ',[doc.contact,doc.phone,doc.email].filter(Boolean).join(' · ')||'-')+agencyDetailRows(doc)+dr('พนักงานขาย',doc.salesPerson)+
      dr('ยอดก่อน VAT','฿'+fmt(doc.subtotal))+dr('VAT 7%',doc.useVat?'฿'+fmt(doc.vatAmt):'ไม่มี VAT')+dr('ยอดรวมทั้งหมด','฿'+fmt(doc.total))+
      dr('สถานะ',doc.approved?'✅ อนุมัติแล้ว':'⏳ รอการอนุมัติ')+dr('หมายเหตุ',doc.note);
  }
  if(type==='production'){
    title=`🏭 สั่งผลิตสินค้า — ${doc.no}`;
    body=dr('เลขที่',doc.no)+dr('วันที่',formatThaiDate(doc.date))+dr('สาขา',BRANCH_TH[doc.branch]||'-')+dr('ผู้รับผลิต/ผู้สั่งผลิต',doc.maker)+dr('ที่อยู่ผู้ผลิต',doc.makerAddress||'-')+dr('เลขผู้เสียภาษีผู้ผลิต',doc.makerTaxId||'-')+dr('ติดต่อผู้ผลิต',[doc.makerContact,doc.makerPhone,doc.makerEmail].filter(Boolean).join(' · ')||'-')+dr('ลูกค้า',doc.customer)+agencyDetailRows(doc)+dr('ชื่องาน',doc.job)+dr('ระยะเวลาในการส่งสินค้า',productionDeliveryLeadLabel(doc.deliveryLeadDays||doc.shippingLeadDays))+dr('กำหนดส่งสินค้า',formatThaiDate(getProductionDeliveryDueDate(doc))||'-')+dr('จำนวน',fmt(doc.qty))+dr('รูปแบบต้นทุน',getPCostSummary(doc))+dr('ต้นทุนรวมจากรายการ (ใช้คำนวณกำไร/ส่งบิล)','฿'+fmt(doc.costTotal ?? doc.costRawTotal ?? (doc.schemaVersion===2?0:doc.subtotal)))+dr('ต้นทุนรวม + VAT 7%','฿'+fmt(doc.costGrandTotal ?? ((doc.costTotal ?? doc.costRawTotal ?? 0)+safeNum(doc.costVatAmt))))+dr('รูปแบบ VAT ต้นทุน (ข้อมูลประกอบ)',doc.costUseVat?'รวม VAT 7%':'ไม่รวม VAT 7%')+dr('VAT 7% ต้นทุน (ข้อมูลประกอบ)','฿'+fmt(doc.costVatAmt||0))+dr('เครดิตการชำระผู้ผลิต',productionSupplierCreditLabel(doc.supplierCreditTerm,doc))+dr('วันเริ่มนับเครดิตผู้ผลิต',formatThaiDate(getProductionSupplierCreditBaseDate(doc.date,doc.supplierCreditTerm||'deliveryLead',doc.deliveryLeadDays||doc.shippingLeadDays,getProductionDeliveryDueDate(doc)))||'-')+dr('วิธีคำนวณเครดิตผู้ผลิต',productionSupplierCreditFormulaLabel(doc))+dr('วันครบกำหนดชำระผู้ผลิต',formatThaiDate(getProductionSupplierDueDate(doc))||'-')+dr('การแจ้งเตือนกำหนดชำระ',productionSupplierDueInfo(doc).text)+dr('สถานะชำระผู้ผลิต',productionSupplierPaymentStatusLabel(doc.supplierPaymentStatus))+dr('หมายเหตุการชำระผู้ผลิต',doc.supplierPaymentNote||'-')+dr('ราคาขายต่อหน่วย',getPSaleSummary(doc))+dr('ยอดขายรวมจากรายการ','฿'+fmt(doc.itemSaleTotal ?? doc.saleTotal ?? doc.total))+dr('รูปแบบ VAT ยอดขาย',vatModeLabel(doc))+dr('ยอดขายก่อน VAT','฿'+fmt(doc.subtotal))+dr('VAT 7% ยอดขาย','฿'+fmt(doc.vatAmt))+dr('ยอดขายรวมทั้งสิ้น','฿'+fmt(doc.total))+dr(commLabel(doc),'฿'+fmt(doc.commAmt))+dr('กำไร',`<span class="${safeNum(doc.profit)>=0?'pos':'neg'}">฿${fmt(doc.profit)}</span>`)+dr('ใบส่งสินค้า / ใบกำกับภาษี',doc.invoiceNo?`✅ ${doc.invoiceNo}`:'ยังไม่ออกบิล')+dr('หมายเหตุ',doc.note);
  }
  if(type==='invoice'){
    title=`🧾 ใบส่งสินค้า / ใบกำกับภาษี — ${doc.no}`;
    const subTotal=Number(doc.subtotal ?? doc.saleTotal ?? 0);
    const vatAmt=Number(doc.vatAmt||0);
    const grandTotal=Number(doc.total ?? (subTotal+vatAmt));
    body=dr('เลขที่บิล',doc.no)+dr('วันที่',formatThaiDate(doc.date))+dr('สาขา',BRANCH_TH[doc.branch]||'-')+dr('ลูกค้า',doc.customer)+dr('ที่อยู่ลูกค้า',doc.customerAddress||doc.address||'-')+dr('เลขผู้เสียภาษีลูกค้า',doc.customerTaxId||'-')+dr('ติดต่อ',[doc.contact,doc.phone,doc.email].filter(Boolean).join(' · ')||'-')+agencyDetailRows(doc)+dr('พนักงานขาย',doc.salesPerson)+
      dr('ใบสั่งผลิตอ้างอิง',doc.sourceProductionNo||'-')+dr('เครดิตการชำระ',invoiceCreditTermLabel(doc.creditTerm))+dr('วันครบกำหนดชำระ',formatThaiDate(getInvoiceDueDate(doc))||'-')+dr('การแจ้งเตือนกำหนดชำระ',invoiceDueInfo(doc).text)+dr('รูปแบบ VAT',vatModeLabel(doc))+dr('ยอดก่อน VAT','฿'+fmt(subTotal))+dr('VAT 7%','฿'+fmt(vatAmt))+dr('ยอดรวมทั้งสิ้น','฿'+fmt(grandTotal))+dr('ต้นทุนรวม','฿'+fmt(doc.costTotal))+
      dr('สถานะชำระเงิน',invoicePaymentBadge(doc))+dr(commLabel(doc),'฿'+fmt(doc.commAmt))+dr('กำไรสุทธิ',`<span class="${doc.profit>=0?'pos':'neg'}">฿${fmt(doc.profit)}</span>`)+dr('หมายเหตุ',doc.note);
  }
  if(type==='receipt'){
    title=`🧾 ใบเสร็จรับเงิน — ${doc.no}`;
    const receiptSubtotal=Number(doc.subtotal ?? doc.saleTotal ?? 0);
    const receiptVat=Number(doc.vatAmt||0);
    const receiptTotal=Number(doc.total ?? doc.saleTotal ?? (receiptSubtotal+receiptVat));
    body=dr('เลขที่ใบเสร็จ',doc.no)+dr('วันที่',formatThaiDate(doc.date))+dr('สาขา',BRANCH_TH[doc.branch]||'-')+dr('เลขใบส่งสินค้า / ใบกำกับภาษีอ้างอิง',doc.invNo)+dr('ลูกค้า',doc.customer)+dr('ที่อยู่ลูกค้า',doc.customerAddress||doc.address||'-')+dr('เลขผู้เสียภาษีลูกค้า',doc.customerTaxId||'-')+dr('ติดต่อ',[doc.contact,doc.phone,doc.email].filter(Boolean).join(' · ')||'-')+agencyDetailRows(doc)+dr('พนักงานขาย',doc.salesPerson)+
      dr('รูปแบบ VAT',vatModeLabel(doc))+dr('ยอดขายรวมจากรายการ','฿'+fmt(doc.itemSaleTotal ?? doc.saleTotal))+dr('ยอดก่อน VAT','฿'+fmt(receiptSubtotal))+dr('VAT 7%','฿'+fmt(receiptVat))+dr('ยอดรวมทั้งสิ้น','฿'+fmt(receiptTotal))+dr('ต้นทุนรวม','฿'+fmt(doc.costTotal))+
      dr(commLabel(doc),'฿'+fmt(doc.commAmt))+dr('กำไรสุทธิ',`<span class="${doc.profit>=0?'pos':'neg'}">฿${fmt(doc.profit)}</span>`)+dr('หมายเหตุ',doc.note);
  }

  if(type==='expense'){
    title=`💸 ค่าใช้จ่ายองค์กร — ${doc.cat||'ค่าใช้จ่าย'}`;
    body=dr('วันที่',formatThaiDate(doc.date))+dr('สาขา',BRANCH_TH[doc.branch]||'-')+dr('หมวดหมู่',`<span class="badge b-amber">${escapeHtml(doc.cat||'-')}</span>`)+dr('ร้านค้า / ผู้ขาย / ผู้ให้บริการ',escapeHtml(doc.vendor||'-'))+dr('รายละเอียด',escapeHtml(doc.desc||'-'))+dr('จำนวนเงิน',`<b class="neg">฿${fmt(doc.amount)}</b>`)+dr('ประเภทเอกสาร',escapeHtml(expenseDocTypeLabel(doc.docType)))+dr('เลขที่เอกสาร',escapeHtml(doc.docNo||'-'))+dr('สถานะใบกำกับภาษี',`<span class="expense-status-pill ${expenseTaxStatusClass(doc.taxStatus)}">${escapeHtml(expenseTaxStatusLabel(doc.taxStatus))}</span>`)+dr('การใช้งานค่าใช้จ่าย',escapeHtml(expensePurposeLabel(doc.purpose)))+dr('ผู้บันทึก',escapeHtml(doc.by||'-'))+dr('หมายเหตุ',escapeHtml(doc.note||'-'));
  }

  // Items table
  if(doc.items?.length){
    body+=`<div style="margin-top:1rem;font-size:12px;font-weight:700;color:var(--g3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">รายการสินค้า</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:var(--g5)">${Object.keys(doc.items[0]).filter(k=>!['product','unit','costUnit'].includes(k)||true).map(()=>'').join('')}
        <th style="padding:6px 8px;border:1px solid var(--g4);font-size:11px;color:var(--g2)">สินค้า</th>
        <th style="padding:6px 8px;border:1px solid var(--g4);font-size:11px;color:var(--g2)">จำนวน</th>
        <th style="padding:6px 8px;border:1px solid var(--g4);font-size:11px;color:var(--g2)">หน่วย</th>
        ${['invoice','production'].includes(type)?`<th style="padding:6px 8px;border:1px solid var(--g4);font-size:11px;color:var(--g2)">รูปแบบต้นทุน</th><th style="padding:6px 8px;border:1px solid var(--g4);font-size:11px;color:var(--g2)">ราคาต้นทุน</th>`:''}<th style="padding:6px 8px;border:1px solid var(--g4);font-size:11px;color:var(--g2)">ราคาขาย/หน่วย</th>
        <th style="padding:6px 8px;border:1px solid var(--g4);font-size:11px;color:var(--g2)">รวม</th>
      </tr></thead><tbody>
      ${doc.items.map(it=>`<tr>
        <td style="padding:6px 8px;border:1px solid var(--g4)">${it.product}</td>
        <td style="padding:6px 8px;border:1px solid var(--g4);text-align:center">${it.qty}</td>
        <td style="padding:6px 8px;border:1px solid var(--g4)">${it.unit||''}</td>
        ${['invoice','production'].includes(type)?`<td style="padding:6px 8px;border:1px solid var(--g4)">${it.costMode==='lump'?'ราคาเหมา':'ราคาต้นทุนต่อหน่วย'}</td><td style="padding:6px 8px;border:1px solid var(--g4);text-align:right">฿${fmt(it.costMode==='lump'?(it.costLump??it.costValue??it.costTotal):(it.costValue??it.costUnit))}</td>`:''}<td style="padding:6px 8px;border:1px solid var(--g4);text-align:right">฿${fmt(getPSaleUnitValue(it))}</td>
        <td style="padding:6px 8px;border:1px solid var(--g4);text-align:right">฿${fmt(it.total||it.saleTotal)}</td>
      </tr>`).join('')}
      </tbody></table></div>`;
  }

  // Attachments
  const atts=doc.attachments||[];
  if(atts.length){
    body+=`<div style="margin-top:1rem;font-size:12px;font-weight:700;color:var(--g3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">หลักฐานแนบ (${atts.length} ไฟล์)</div>
    <div class="attach-grid">`;
    atts.forEach(f=>{
      const fileName=f.name||'ไฟล์แนบ';
      const fileType=f.type||'';

      // 0) ไฟล์ที่อัปโหลดเข้า Google Drive แล้ว
      if(f.provider==='google-drive'&&f.webViewLink){
        const link=escapeHtml(f.webViewLink);
        const icon=(fileType||f.mimeType||'').startsWith('image/')?'🖼️':'📎';
        body+=`<a class="attach-item" href="${link}" target="_blank" rel="noopener" title="เปิดหลักฐานใน Google Drive">
          <div class="pdf-box">${icon} DRIVE</div>
          <div style="font-size:10px;color:var(--g3);text-align:center;margin-top:3px;max-width:110px;word-break:break-all">${escapeHtml(f.originalName||fileName)}</div>
          <div style="font-size:9px;color:var(--blue);text-align:center;margin-top:2px">เปิดใน Google Drive</div>
        </a>`;
        return;
      }

      // 1) ไฟล์ที่อยู่ในเครื่องเดิมแบบ data URL
      if(f.data){
        if(fileType.startsWith('image/')){
          body+=`<div class="attach-item" onclick="openFile('${f.data}','image')" title="คลิกเพื่อดูรูป"><img src="${f.data}" alt="${fileName}"><div style="font-size:10px;color:var(--g3);text-align:center;margin-top:3px">${fileName}</div></div>`;
        } else {
          body+=`<div class="attach-item" onclick="openFile('${f.data}','pdf')" title="คลิกเปิด PDF"><div class="pdf-box"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>PDF</div><div style="font-size:10px;color:var(--g3);text-align:center;margin-top:3px;max-width:90px;word-break:break-all">${fileName}</div></div>`;
        }
        return;
      }

      // 2) ไฟล์ local-only ที่เก็บไว้ใน IndexedDB ของเครื่องที่อัปโหลด
      if(f.provider==='local'&&f.localId){
        const kind=fileType.startsWith('image/')?'image':'pdf';
        body+=`<div class="attach-item" onclick="openLocalAttachment('${f.localId}','${kind}')" title="ไฟล์นี้เปิดได้เฉพาะเครื่องที่อัปโหลด">
          <div class="pdf-box">📁 LOCAL</div>
          <div style="font-size:10px;color:var(--g3);text-align:center;margin-top:3px;max-width:110px;word-break:break-all">${fileName}</div>
          <div style="font-size:9px;color:var(--red);text-align:center;margin-top:2px">เฉพาะเครื่องนี้</div>
        </div>`;
        return;
      }

      // 3) เผื่ออนาคตใช้ Cloudinary / Firebase Storage แล้วมี URL
      if(f.url||f.secure_url){
        const url=f.secure_url||f.url;
        if(fileType.startsWith('image/')){
          body+=`<div class="attach-item" onclick="openFile('${url}','image')" title="คลิกเพื่อดูรูป"><img src="${url}" alt="${fileName}"><div style="font-size:10px;color:var(--g3);text-align:center;margin-top:3px">${fileName}</div></div>`;
        } else {
          body+=`<div class="attach-item" onclick="openFile('${url}','pdf')" title="คลิกเปิดไฟล์"><div class="pdf-box"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>FILE</div><div style="font-size:10px;color:var(--g3);text-align:center;margin-top:3px;max-width:90px;word-break:break-all">${fileName}</div></div>`;
        }
        return;
      }

      body+=`<div class="attach-item" title="ไม่พบไฟล์ในเครื่องนี้"><div class="pdf-box">⚠️</div><div style="font-size:10px;color:var(--red);text-align:center;margin-top:3px;max-width:110px;word-break:break-all">${fileName}<br>เปิดไม่ได้ในเครื่องนี้</div></div>`;
    });
    body+='</div>';
  }
  document.getElementById('modal-title').innerHTML=title;
  document.getElementById('modal-body').innerHTML=body;
}

function openFile(data,type){
  const w=window.open();
  if(type==='pdf')w.document.write(`<iframe src="${data}" style="width:100%;height:100vh;border:none"></iframe>`);
  else w.document.write(`<img src="${data}" style="max-width:100%;display:block;margin:auto">`);
}
async function openLocalAttachment(localId,type){
  if(!window.LocalFileStore?.getLocalAttachmentUrl){
    notify('เครื่องนี้ยังไม่มีระบบอ่านไฟล์ local หรือไฟล์นี้ไม่ได้อยู่ในเครื่องนี้');
    return;
  }
  const url=await window.LocalFileStore.getLocalAttachmentUrl(localId);
  if(!url){
    notify('ไฟล์นี้เปิดได้เฉพาะเครื่อง/browser ที่อัปโหลดเท่านั้น หรือไฟล์ถูกลบจากเครื่องนี้แล้ว');
    return;
  }
  openFile(url,type);
}
function closeModal(){document.getElementById('detail-modal').classList.remove('open');}

// ============================================================
// EXPORT / IMPORT — เลือกเดือน เลือกปี และโหลดไฟล์รายปีได้
// ============================================================
function loadSheetJS(cb){
  if(window.XLSX){cb();return;}
  const s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload=cb;
  document.head.appendChild(s);
}

function initExportControls(){
  const years=allYears();
  populateYearSel('ex-year',years);
  populateMonthSel('ex-month',false);
  const y=document.getElementById('ex-year');
  const m=document.getElementById('ex-month');
  if(y)y.value=now.getFullYear();
  if(m)m.value=String(now.getMonth());
}

function normalizeDataPack(data){
  return {
    quotes:Array.isArray(data?.quotes)?data.quotes:[],
    invoices:Array.isArray(data?.invoices)?data.invoices:[],
    receipts:Array.isArray(data?.receipts)?data.receipts:[],
    issuedInvoices:Array.isArray(data?.issuedInvoices)?data.issuedInvoices:[],
    issuedReceipts:Array.isArray(data?.issuedReceipts)?data.issuedReceipts:[],
    expenses:Array.isArray(data?.expenses)?data.expenses:[],
    productions:Array.isArray(data?.productions)?data.productions:[]
  };
}

function hasAnyData(data){
  const d=normalizeDataPack(data);
  return d.quotes.length||d.invoices.length||d.receipts.length||d.issuedInvoices.length||d.issuedReceipts.length||d.expenses.length||d.productions.length;
}

function getExportSelection(){
  const bEl=document.getElementById('ex-branch');
  const yEl=document.getElementById('ex-year');
  const mEl=document.getElementById('ex-month');
  const tEl=document.getElementById('ex-type');
  return {
    branch:bEl?.value||'',
    year:parseInt(yEl?.value||now.getFullYear()),
    month:mEl?.value===''?null:parseInt(mEl?.value??now.getMonth()),
    type:tEl?.value||'all'
  };
}

function thaiYear(y){return y+'-'+(y+543);}
function safeName(s){return String(s).replace(/[\\/:*?"<>|\s]+/g,'_');}
function exportBranchLabel(branch){
  return branch ? (BRANCH_TH[branch] || branch) : 'รวมสองสาขา';
}
function exportBranchFilePart(branch){
  return branch ? branch : 'all_branches';
}
function monthKeyToIndex(key){
  if(typeof key==='number')return key>=0&&key<=11?key:key-1;
  const str=String(key);
  const th=MONTHS.indexOf(str);
  if(th>=0)return th;
  const n=parseInt(str,10);
  if(Number.isFinite(n))return n>=1&&n<=12?n-1:n;
  return -1;
}

function collectBackupData({year=null,month=null,branch='',includeEmpty=false}={}){
  const years=year?[parseInt(year)]:allYears();
  const months=month===null||month===undefined?Array.from({length:12},(_,i)=>i):[parseInt(month)];
  const branches=branch?[branch]:tenantActiveBranchIds();
  const result={};
  years.forEach(y=>{
    result[y]={};
    branches.forEach(br=>{
      result[y][br]={};
      months.forEach(m=>{
        const d=normalizeDataPack(loadFor(br,y,m));
        if(includeEmpty||hasAnyData(d))result[y][br][MONTHS[m]]=d;
      });
    });
  });
  return result;
}

function downloadJSON(payload,filename){
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filename;
  a.click();
  URL.revokeObjectURL(url);
}

function collectLocalMasterBackup(){return{contacts:contactMasterRows(),products:readLocalMaster(PRODUCT_MASTER_LOCAL_KEY,[]),productionCore:window.ERPProductionCore?.exportData?.()||{},version:2,exportedAt:new Date().toISOString()};}
function restoreLocalMasterBackup(masterData={}){
  if(Array.isArray(masterData.contacts))writeLocalMaster(CONTACT_MASTER_KEY,masterData.contacts);
  if(Array.isArray(masterData.products))writeLocalMaster(PRODUCT_MASTER_LOCAL_KEY,masterData.products);
  if(masterData.productionCore)window.ERPProductionCore?.importData?.(masterData.productionCore);
  refreshContactMasterDatalists();initProductMasterDatalist();renderMasterData();
  window.pcRenderInventory?.();window.pcRenderAudit?.();
}

function exportSelectedMonthJSON(){
  const {year,month,branch}=getExportSelection();
  if(month===null){notify('กรุณาเลือกเดือนก่อนดาวน์โหลดไฟล์รายเดือน');return;}
  const payload={
    meta:{app:'comform-esan',backupType:'month',branch:branch||'all',branchName:exportBranchLabel(branch),year,month:month+1,monthName:MONTHS[month],exportedAt:new Date().toISOString()},
    data:collectBackupData({year,month,branch,includeEmpty:true}),
    masterData:collectLocalMasterBackup()
  };
  downloadJSON(payload,`backup_comform_${exportBranchFilePart(branch)}_${year}_${String(month+1).padStart(2,'0')}_${safeName(MONTHS[month])}.json`);
}

function exportSelectedYearJSON(){
  const {year,branch}=getExportSelection();
  const payload={
    meta:{app:'comform-esan',backupType:'year',branch:branch||'all',branchName:exportBranchLabel(branch),year,exportedAt:new Date().toISOString()},
    data:collectBackupData({year,branch,includeEmpty:true}),
    masterData:collectLocalMasterBackup()
  };
  downloadJSON(payload,`backup_comform_${exportBranchFilePart(branch)}_year_${year}_${year+543}.json`);
}

function exportAllJSON(){
  const {branch}=getExportSelection();
  const payload={
    meta:{app:'comform-esan',backupType:'all',branch:branch||'all',branchName:exportBranchLabel(branch),exportedAt:new Date().toISOString()},
    data:collectBackupData({branch,includeEmpty:false}),
    masterData:collectLocalMasterBackup()
  };
  downloadJSON(payload,`backup_comform_${exportBranchFilePart(branch)}_all_${now.getFullYear()}_${now.getFullYear()+543}.json`);
}

function exportSelectedMonthExcel(){
  const {year,month,type,branch}=getExportSelection();
  if(month===null){notify('กรุณาเลือกเดือนก่อนดาวน์โหลด Excel รายเดือน');return;}
  exportXLSX(type,{year,month,branch,scopeLabel:`${exportBranchFilePart(branch)}_${year}_${String(month+1).padStart(2,'0')}_${safeName(MONTHS[month])}`});
}

function exportSelectedYearExcel(){
  const {year,type,branch}=getExportSelection();
  exportXLSX(type,{year,branch,scopeLabel:`${exportBranchFilePart(branch)}_year_${year}_${year+543}`});
}

function exportAllExcel(){
  const {branch}=getExportSelection();
  exportXLSX('all',{branch,scopeLabel:`${exportBranchFilePart(branch)}_all_${now.getFullYear()}_${now.getFullYear()+543}`});
}

function exportXLSX(type,options={}){
  loadSheetJS(()=>{
    const wb=XLSX.utils.book_new();
    const years=options.year?[parseInt(options.year)]:allYears();
    const months=options.month!==undefined&&options.month!==null&&options.month!==''?[parseInt(options.month)]:Array.from({length:12},(_,i)=>i);
    const branches=options.branch?[options.branch]:tenantActiveBranchIds();

    if(type==='all'||type==='invoices'){
      const rows=[['วันที่ขาย','เลขที่บิล','พนักงานขาย','ชื่อลูกค้า','ประเภทหน่วยงาน','ประเภทย่อย','เครดิตการชำระ','วันครบกำหนดชำระ','สถานะกำหนดชำระ','สถานะชำระเงิน','รายการสินค้า','จำนวน','รูปแบบราคาต้นทุน','ราคาต้นทุน','รวมต้นทุน','ราคาขายต่อหน่วย','รวมราคาขายพร้อม VAT','ถอด VAT 7%','สวัสดิการหรือค่าคอมมิชชั่น','กำไร','%กำไรต้นทุน','%กำไรยอดขาย']];
      years.forEach(y=>branches.forEach(br=>months.forEach(m=>{
        const d=normalizeDataPack(loadFor(br,y,m));
        d.invoices.forEach(inv=>{
          const itemRows=getInvoiceReportRows(inv);
          itemRows.forEach((it)=>rows.push([
            formatThaiDate(inv.date),
            inv.no||'',
            inv.salesPerson||'',
            inv.customer||'',
            customerAgencyForRecord(inv).customerAgencyGroupLabel,
            customerAgencyForRecord(inv).customerAgencyTypeLabel,
            invoiceCreditTermLabel(inv.creditTerm),
            formatThaiDate(getInvoiceDueDate(inv)),
            invoiceDueInfo(inv).text,
            invoicePaymentText(inv),
            it.product||'',
            it.qty,
            it.costModeLabel,
            it.costValue,
            it.costTotal,
            it.priceUnit,
            it.grossWithVat,
            it.netExVat,
            it.commShare,
            it.profit,
            it.profitCostPct,
            it.profitSalePct
          ]));
        });
      })));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'ใบส่งสินค้า / ใบกำกับภาษี');
    }

    if(type==='all'||type==='quotes'){
      const rows=[['สาขา','ปี','เดือน','เลขที่','วันที่','ลูกค้า','ประเภทหน่วยงาน','ประเภทย่อย','พนักงานขาย','สินค้า','จำนวน','หน่วย','ราคา/หน่วย','ราคารวม','ยอดก่อน VAT','VAT 7%','ยอดรวม','สถานะ','หมายเหตุ']];
      years.forEach(y=>branches.forEach(br=>months.forEach(m=>{
        const d=normalizeDataPack(loadFor(br,y,m));
        d.quotes.forEach(q=>{
          if((q.items||[]).length){
            (q.items||[]).forEach((it,idx)=>rows.push([idx===0?BRANCH_TH[br]:'',idx===0?yearLabelBE(y):'',idx===0?MONTHS[m]:'',idx===0?q.no:'',idx===0?formatThaiDate(q.date):'',idx===0?q.customer:'',idx===0?customerAgencyForRecord(q).customerAgencyGroupLabel:'',idx===0?customerAgencyForRecord(q).customerAgencyTypeLabel:'',idx===0?q.salesPerson||'':'',it.product,it.qty,it.unit||'',it.priceUnit,it.total,idx===0?q.subtotal:'',idx===0?q.vatAmt:'',idx===0?q.total:'',idx===0?(q.approved?'อนุมัติแล้ว':'รอ'):'',idx===0?q.note||'':'']));
          }else{
            rows.push([BRANCH_TH[br],yearLabelBE(y),MONTHS[m],q.no,formatThaiDate(q.date),q.customer,customerAgencyForRecord(q).customerAgencyGroupLabel,customerAgencyForRecord(q).customerAgencyTypeLabel,q.salesPerson||'','',0,'',0,0,q.subtotal,q.vatAmt,q.total,q.approved?'อนุมัติแล้ว':'รอ',q.note||'']);
          }
        });
      })));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'ใบเสนอราคา');
    }

    if(type==='all'||type==='receipts'){
      const rows=[['สาขา','ปี','เดือน','เลขที่ใบเสร็จ','วันที่','เลขบิล','ลูกค้า','ประเภทหน่วยงาน','ประเภทย่อย','พนักงานขาย','สินค้า','จำนวน','หน่วย','ราคาขาย/หน่วย','ยอดขายรายการ','ยอดก่อน VAT','VAT 7%','ยอดรวมทั้งสิ้น','รูปแบบ VAT','วิธีคิดคอม','%คอม','คอมมิสชัน','กำไรสุทธิ','หมายเหตุ']];
      years.forEach(y=>branches.forEach(br=>months.forEach(m=>{
        const d=normalizeDataPack(loadFor(br,y,m));
        d.receipts.forEach(r=>{
          if((r.items||[]).length){
            (r.items||[]).forEach((it,idx)=>rows.push([idx===0?BRANCH_TH[br]:'',idx===0?yearLabelBE(y):'',idx===0?MONTHS[m]:'',idx===0?r.no:'',idx===0?formatThaiDate(r.date):'',idx===0?r.invNo||'':'',idx===0?r.customer:'',idx===0?customerAgencyForRecord(r).customerAgencyGroupLabel:'',idx===0?customerAgencyForRecord(r).customerAgencyTypeLabel:'',idx===0?r.salesPerson||'':'',it.product,it.qty,it.unit||'',it.priceUnit,it.saleTotal,idx===0?r.subtotal??r.saleTotal:'',idx===0?r.vatAmt||0:'',idx===0?r.total??r.saleTotal:'',idx===0?vatModeLabel(r):'',idx===0?(r.commMode==='manual'?'กรอกเอง':'เปอร์เซ็นต์'):'',idx===0?r.commRate:'',idx===0?r.commAmt:'',idx===0?r.profit:'',idx===0?r.note||'':'']));
          }else{
            rows.push([BRANCH_TH[br],yearLabelBE(y),MONTHS[m],r.no,formatThaiDate(r.date),r.invNo||'',r.customer,customerAgencyForRecord(r).customerAgencyGroupLabel,customerAgencyForRecord(r).customerAgencyTypeLabel,r.salesPerson||'','',0,'',0,r.saleTotal,r.subtotal??r.saleTotal,r.vatAmt||0,r.total??r.saleTotal,vatModeLabel(r),(r.commMode==='manual'?'กรอกเอง':'เปอร์เซ็นต์'),r.commRate,r.commAmt,r.profit,r.note||'']);
          }
        });
      })));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'ใบเสร็จรับเงิน');
    }

    if(type==='all'||type==='expenses'){
      const rows=[['สาขา','ปี','เดือน','วันที่','หมวดหมู่','รายละเอียด','ผู้บันทึก','จำนวนเงิน (บาท)','หมายเหตุ']];
      years.forEach(y=>branches.forEach(br=>months.forEach(m=>{
        const d=normalizeDataPack(loadFor(br,y,m));
        d.expenses.forEach(e=>rows.push([BRANCH_TH[br],yearLabelBE(y),MONTHS[m],formatThaiDate(e.date),e.cat,e.desc,e.by||'',e.amount,e.note||'']));
      })));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'ค่าใช้จ่าย');
    }

    if(type==='all'||type==='productions'){
      const rows=[['สาขา','ปี','เดือน','เลขที่','วันที่','ผู้รับผลิต/ผู้สั่งผลิต','ลูกค้า','ประเภทหน่วยงาน','ประเภทย่อย','ชื่องาน','ระยะเวลาส่งสินค้า','กำหนดส่งสินค้า','รายการสินค้า','จำนวน','หน่วย','รูปแบบต้นทุน','ราคาต้นทุน','ต้นทุนรวม','ต้นทุนรวม + VAT 7%','เครดิตชำระผู้ผลิต','วันครบกำหนดชำระผู้ผลิต','สถานะชำระผู้ผลิต','หมายเหตุการชำระผู้ผลิต','ราคาขายต่อหน่วย','ยอดขายรวม','รูปแบบ VAT ยอดขาย','ยอดขายก่อน VAT','VAT 7% ยอดขาย','ยอดขายรวมทั้งสิ้น','รูปแบบ VAT ต้นทุน','ต้นทุนก่อน VAT','VAT 7% ต้นทุน','ต้นทุนรวมทั้งสิ้น','วิธีค่าคอมมิสชัน','อัตราคอมฯ %','ค่าคอมมิสชัน','กำไร','เลขบิลที่เชื่อม','หมายเหตุ']];
      years.forEach(y=>branches.forEach(br=>months.forEach(m=>{
        const d=normalizeDataPack(loadFor(br,y,m));
        d.productions.forEach(p=>{
          const items=(p.items&&p.items.length)?p.items:[{}];
          items.forEach((it,idx)=>rows.push([BRANCH_TH[br],yearLabelBE(y),MONTHS[m],p.no,formatThaiDate(p.date),p.maker,p.customer,customerAgencyForRecord(p).customerAgencyGroupLabel,customerAgencyForRecord(p).customerAgencyTypeLabel,p.job,idx===0?productionDeliveryLeadLabel(p.deliveryLeadDays||p.shippingLeadDays):'',idx===0?formatThaiDate(getProductionDeliveryDueDate(p)):'',it.product||p.job,it.qty||0,it.unit||'',it.costMode==='lump'?'ราคาเหมา':'ราคาต้นทุนต่อหน่วย',it.costValue??(it.costMode==='lump'?it.costLump:it.costUnit)??0,it.costTotal||0,idx===0?(p.costGrandTotal??((p.costTotal||0)+(p.costVatAmt||0))):'',idx===0?productionSupplierCreditLabel(p.supplierCreditTerm,p):'',idx===0?formatThaiDate(getProductionSupplierDueDate(p)):'',idx===0?productionSupplierPaymentStatusLabel(p.supplierPaymentStatus):'',idx===0?(p.supplierPaymentNote||''):'',getPSaleUnitValue(it),it.saleTotal||0,vatModeLabel(p),idx===0?p.subtotal:'',idx===0?p.vatAmt:'',idx===0?p.total:'',idx===0?(p.costUseVat?'รวม VAT 7%':'ไม่รวม VAT 7%'):'',idx===0?(p.costSubtotal??p.costTotal):'',idx===0?(p.costVatAmt||0):'',idx===0?(p.costGrandTotal??p.costTotal):'',idx===0?(p.commMode==='manual'?'ใส่จำนวนเอง':'คิดเปอร์เซ็นต์'):'',idx===0?(p.commRate||0):'',idx===0?(p.commAmt||0):'',idx===0?(p.profit||0):'',idx===0?(p.invoiceNo||''):'',idx===0?(p.note||''):'']));
        });
      })));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'สั่งผลิตสินค้า');
    }

    const label={all:'ทุกรายการ',invoices:'บิลขาย',quotes:'ใบเสนอราคา',receipts:'ใบเสร็จ',expenses:'ค่าใช้จ่าย',productions:'สั่งผลิตสินค้า'}[type]||type;
    const scope=options.scopeLabel||`all_${now.getFullYear()}_${now.getFullYear()+543}`;
    XLSX.writeFile(wb,`export_comform_${safeName(label)}_${scope}.xlsx`);
  });
}


function isSalesAnalyticsDataset(raw){
  return Boolean(raw && typeof raw==='object' && raw.collections && Array.isArray(raw.collections.salesDocuments));
}

function safeImportNumber(value){
  const n=Number(value);
  return Number.isFinite(n)?roundMoneyValue(n):0;
}

function importedSalesProductionId(source={}){
  return `historical-sales:${String(source.id||source.documentNo||'unknown')}`;
}

function convertSalesDocumentToProduction(source={}){
  const totals=source.totals||{};
  const sourceItems=Array.isArray(source.items)?source.items:[];
  const items=sourceItems.map((item,index)=>{
    const saleTotal=safeImportNumber(item.saleTotal);
    const costTotal=safeImportNumber(item.costTotal);
    const rawQty=Number(item.quantity);
    const qty=Number.isFinite(rawQty)&&rawQty>0?rawQty:1;
    const saleUnit=safeImportNumber(item.salePricePerUnit)||(qty?saleTotal/qty:0);
    const costUnit=safeImportNumber(item.costPerUnit)||(qty?costTotal/qty:0);
    return{
      product:String(item.product||`รายการที่ ${index+1}`).trim(),
      qty,
      unit:String(item.unit||'รายการ'),
      costMode:'unit',costValue:costUnit,costEntered:true,costUnit,costLump:0,costTotal,
      saleMode:'unit',saleValue:saleUnit,saleEntered:true,priceUnit:saleUnit,saleLump:0,saleTotal,
      welfare:safeImportNumber(item.welfare),
      sourceRow:item.sourceRow??null
    };
  }).filter(item=>item.product||item.saleTotal||item.costTotal);

  const subtotal=safeImportNumber(totals.saleTotal)||roundMoneyValue(items.reduce((sum,item)=>sum+safeImportNumber(item.saleTotal),0));
  const costTotal=safeImportNumber(totals.costTotal)||roundMoneyValue(items.reduce((sum,item)=>sum+safeImportNumber(item.costTotal),0));
  const commAmt=safeImportNumber(totals.welfare)||roundMoneyValue(items.reduce((sum,item)=>sum+safeImportNumber(item.welfare),0));
  const profit=Number.isFinite(Number(totals.profit))?safeImportNumber(totals.profit):roundMoneyValue(subtotal-costTotal-commAmt);
  const firstProduct=items.find(item=>item.product)?.product||'';

  return{
    id:importedSalesProductionId(source),
    schemaVersion:3,
    no:String(source.documentNo||source.id||'').trim(),
    date:String(source.date||''),
    year:Number(source.year)||now.getFullYear(),
    monthIndex:Number.isFinite(Number(source.monthIndex))?Number(source.monthIndex):Math.max(0,(Number(source.monthNumber)||1)-1),
    monthNumber:Number(source.monthNumber)||((Number(source.monthIndex)||0)+1),
    branch:String(source.branch||'khonkaen'),
    maker:'ข้อมูลยอดขายย้อนหลัง',
    customer:String(source.customerName||'ไม่ระบุลูกค้า').trim(),
    ...customerAgencyForRecord({customer:String(source.customerName||'ไม่ระบุลูกค้า').trim()}),
    salesPerson:String(source.salesperson||''),
    job:firstProduct||`ยอดขายย้อนหลัง ${source.documentNo||''}`.trim(),
    items,
    qty:items.reduce((sum,item)=>sum+safeImportNumber(item.qty),0),
    unit:items.length===1?items[0].unit:'',
    costMode:items.length===1?'unit':'mixed',costValue:items.length===1?items[0].costUnit:0,costUnit:items.length===1?items[0].costUnit:0,costLump:0,costTotal,
    costSubtotal:costTotal,costUseVat:0,costVatMode:'none',costVatAmt:0,costGrandTotal:costTotal,
    saleMode:'unit',saleValue:items.length===1?items[0].priceUnit:0,priceUnit:items.length===1?items[0].priceUnit:0,saleLump:0,itemSaleTotal:subtotal,saleTotal:subtotal,
    subtotal,useVat:0,vatMode:'none',vatAmt:0,total:subtotal,
    commMode:'manual',commRate:0,commAmt,profit,
    supplierCreditTerm:'',supplierDueDate:'',supplierPaymentStatus:'paid',supplierPaymentNote:'นำเข้าจากฐานข้อมูลยอดขายเดิม',
    invoiceStatus:'historical',invoiceNo:'',invoiceId:'',
    note:`นำเข้าจาก ${source.sourceFile||'ไฟล์ยอดขาย'}${source.sourceSheet?` / ${source.sourceSheet}`:''}`,
    attachments:[],
    historicalSalesImport:true,
    sourceDataset:'salesDocuments',
    sourceDatasetId:String(source.id||''),
    sourceStatus:String(source.status||'active'),
    sourceRows:Array.isArray(source.sourceRows)?source.sourceRows:[],
    importedAt:new Date().toISOString()
  };
}

function mergeImportedProductions(records=[]){
  const stats={inserted:0,updated:0,skipped:0,months:new Set()};
  records.forEach(record=>{
    const branch=record.branch;
    const year=Number(record.year);
    const month=Number(record.monthIndex);
    if(!BRANCH_TH[branch]||!Number.isFinite(year)||month<0||month>11||!record.date){stats.skipped++;return;}
    const store=loadFor(branch,year,month);
    const list=Array.isArray(store.productions)?store.productions:[];
    const idx=list.findIndex(row=>String(row.id)===String(record.id)||(
      row.historicalSalesImport && row.sourceDatasetId && String(row.sourceDatasetId)===String(record.sourceDatasetId)
    ));
    if(idx>=0){
      list[idx]={...list[idx],...record,firebaseId:list[idx].firebaseId||record.firebaseId||''};
      stats.updated++;
    }else{
      list.push(record);
      stats.inserted++;
    }
    store.productions=dedupeRecords(list);
    saveFor(branch,year,month,store);
    stats.months.add(`${year}-${month}`);
  });
  return stats;
}

async function importSalesAnalyticsDataset(raw,options={}){
  const sourceDocs=raw.collections.salesDocuments||[];
  const activeDocs=sourceDocs.filter(doc=>String(doc.status||'active')==='active' && safeImportNumber(doc?.totals?.saleTotal)>0 && doc.date);
  const productions=activeDocs.map(convertSalesDocumentToProduction);
  const localStats=mergeImportedProductions(productions);
  let cloudStats=null;
  if(options.syncCloud){
    if(!window.FirebaseService?.importHistoricalSalesDataset)throw new Error('Firebase importer ยังโหลดไม่พร้อม กรุณารีเฟรชหน้าแล้วลองใหม่');
    cloudStats=await window.FirebaseService.importHistoricalSalesDataset({
      archiveRecords:sourceDocs,
      productionRecords:productions,
      metadata:raw.metadata||{}
    });
  }
  return{
    format:'sales-analytics',sourceCount:sourceDocs.length,activeCount:activeDocs.length,
    cancelledCount:sourceDocs.filter(x=>x.status==='cancelled').length,
    replacementCount:sourceDocs.filter(x=>x.status==='replacement').length,
    zeroOrInvalidCount:sourceDocs.length-activeDocs.length-sourceDocs.filter(x=>x.status==='cancelled'||x.status==='replacement').length,
    localStats,cloudStats,validationIssues:Array.isArray(raw.validationIssues)?raw.validationIssues.length:0
  };
}

function mergeBackupPack(branch,year,month,incoming,replace=false){
  const normalized=normalizeDataPack(incoming);
  if(replace){saveFor(branch,year,month,normalized);return;}
  const current=normalizeDataPack(loadFor(branch,year,month));
  const merged=createEmptyBusinessStore();
  Object.keys(merged).forEach(type=>{
    merged[type]=dedupeRecords([...(current[type]||[]),...(normalized[type]||[])]);
  });
  saveFor(branch,year,month,merged);
}

async function repairHistoricalImportData(){
  const statusEl=document.getElementById('import-json-status');
  const ok=confirm(
    'ระบบจะตรวจและซ่อมข้อมูลเก่าใน Firebase ได้แก่\n'+
    'ใบเสนอราคา, ใบส่งสินค้า / ใบกำกับภาษี, ใบเสร็จรับเงิน, เอกสารออกจริง, สั่งผลิต, ค่าใช้จ่าย และ salesArchive\n\n'+
    'ระบบจะแก้เฉพาะเอกสารที่ branch/year/month/attachments ผิดโครงสร้าง หรือยังไม่มี yearBE/dateThai สำหรับแสดงผล พ.ศ.\n'+
    'ควรสำรอง Firestore ก่อน และต้องเปิด systemSettings/security.recoveryMode = true ชั่วคราวก่อนซ่อม\nหลังซ่อมเสร็จให้ปิด recoveryMode กลับเป็น false\n\nดำเนินการต่อหรือไม่?'
  );
  if(!ok)return;
  try{
    if(statusEl){statusEl.textContent='กำลังตรวจและซ่อมข้อมูลทุก Collection ใน Firebase...';statusEl.className='import-json-status working';}
    const repairFn=window.FirebaseService?.repairLegacyBusinessCollections
      || window.FirebaseService?.repairMalformedHistoricalProductions;
    if(!repairFn)throw new Error('ยังไม่พบฟังก์ชันซ่อมข้อมูล กรุณารีเฟรชหน้าเว็บหลัง Deploy เวอร์ชันใหม่');
    const result=await repairFn();
    const details=Object.entries(result.collections||{})
      .map(([name,s])=>`${name}: ${s.repaired}/${s.malformed}`)
      .join(', ');
    const msg=`ซ่อมข้อมูลเสร็จแล้ว: ตรวจ ${result.scanned} เอกสาร, พบผิดโครงสร้าง ${result.malformed}, ซ่อมสำเร็จ ${result.repaired}`;
    if(statusEl){statusEl.textContent=msg+(details?` — ${details}`:'');statusEl.className='import-json-status success';}
    notify(msg+(details?`\n\n${details}`:'')+'\n\nระบบจะดึงข้อมูลจาก Firebase ใหม่');
    await syncFromFirebaseYear(getCurrentSelectedYear(), { silent:false });
  }catch(err){
    console.error(err);
    const msg='ซ่อมข้อมูลไม่สำเร็จ: '+(err?.message||err);
    if(statusEl){statusEl.textContent=msg;statusEl.className='import-json-status error';}
    notify(msg);
  }
}


async function importJSON(ev){
  const f=ev.target.files[0];if(!f)return;
  const syncCloud=document.getElementById('import-sync-cloud')?.checked!==false;
  const replaceBackup=document.getElementById('import-mode')?.value==='replace';
  const statusEl=document.getElementById('import-json-status');
  if(statusEl){statusEl.textContent='กำลังอ่านและตรวจสอบไฟล์...';statusEl.className='import-json-status working';}
  try{
    const text=await f.text();
    const raw=JSON.parse(text);
    const masterImported=Boolean(raw?.masterData);
    if(masterImported)restoreLocalMasterBackup(raw.masterData);
    if(isSalesAnalyticsDataset(raw)){
      const sourceCount=raw.collections.salesDocuments.length;
      const activeCount=raw.collections.salesDocuments.filter(x=>x.status==='active'&&safeImportNumber(x?.totals?.saleTotal)>0&&x.date).length;
      const ok=confirm(`ตรวจพบฐานข้อมูลยอดขายสำหรับวิเคราะห์\nทั้งหมด ${sourceCount.toLocaleString('th-TH')} เอกสาร\nรายการยอดขายที่จะใช้คำนวณ ${activeCount.toLocaleString('th-TH')} เอกสาร\n\nระบบจะรวมข้อมูลโดยไม่สร้างรายการซ้ำ${syncCloud?' และอัปโหลดขึ้น Firebase':''}\nดำเนินการต่อหรือไม่?`);
      if(!ok)return;
      if(statusEl)statusEl.textContent=syncCloud?'กำลังนำเข้าในเครื่องและอัปโหลด Firebase...':'กำลังนำเข้าข้อมูลในเครื่อง...';
      const result=await importSalesAnalyticsDataset(raw,{syncCloud});
      onYearChange();initExportControls();renderDash();renderPList();populateProductionRefs();
      const cloudText=result.cloudStats?`\nFirebase: Production ${result.cloudStats.productionWrites} รายการ, คลังดิบ ${result.cloudStats.archiveWrites} รายการ`:'';
      const msg=`นำเข้าฐานข้อมูลยอดขายสำเร็จ\nข้อมูลใช้งาน ${result.activeCount} รายการ\nเพิ่มใหม่ ${result.localStats.inserted} / อัปเดต ${result.localStats.updated}\nข้ามรายการยกเลิก ${result.cancelledCount} / เขียนบิลแทน ${result.replacementCount}${cloudText}`;
      if(statusEl){statusEl.textContent=msg.replaceAll('\n',' · ');statusEl.className='import-json-status success';}
      notify(msg);
      return;
    }

    const obj=raw.data||raw;
    if(replaceBackup){
      createLocalBackupSnapshot(getCurrentSelectedYear(),'before-json-replace-import',getCurrentProfile());
    }
    let importedPacks=0;
    if(obj.quotes||obj.invoices||obj.receipts||obj.expenses||obj.productions){
      const y=now.getFullYear(),m=now.getMonth();
      mergeBackupPack('khonkaen',y,m,obj,replaceBackup);importedPacks++;
    }else{
      Object.entries(obj).forEach(([y,brs])=>{
        if(!brs||typeof brs!=='object')return;
        Object.entries(brs).forEach(([br,months])=>{
          if(!['khonkaen','ubon'].includes(br)||!months||typeof months!=='object')return;
          Object.entries(months).forEach(([mName,data])=>{
            const mIdx=monthKeyToIndex(mName);
            if(mIdx>=0&&mIdx<=11){mergeBackupPack(br,parseInt(y),mIdx,data,replaceBackup);importedPacks++;}
          });
        });
      });
    }
    if(!importedPacks&&!masterImported)throw new Error('ไม่พบข้อมูลที่ระบบรองรับในไฟล์');
    onYearChange();initExportControls();renderDash();
    const msg=importedPacks?`นำเข้า Backup JSON สำเร็จ ${importedPacks} ชุด (${replaceBackup?'แทนที่ข้อมูลเดิม':'รวมและตัดรายการซ้ำ'})${masterImported?' · รวมข้อมูลหลักลูกค้า/ผู้จำหน่าย/สินค้าแล้ว':''}`:'นำเข้าข้อมูลหลักลูกค้า / ผู้จำหน่าย / สินค้าสำเร็จ';
    if(statusEl){statusEl.textContent=msg;statusEl.className='import-json-status success';}
    notify(msg);
  }catch(err){
    console.error(err);
    const msg='นำเข้าไม่สำเร็จ: '+(err?.message||'ไฟล์ JSON ไม่ตรงกับระบบ');
    if(statusEl){statusEl.textContent=msg;statusEl.className='import-json-status error';}
    notify(msg);
  }finally{
    ev.target.value='';
  }
}

// ============================================================
// CSV IMPORT WIZARD — Customer / Supplier / Product Master
// ============================================================
const CSV_IMPORT_SCHEMAS={
  customer:{label:'Customer Master · ลูกค้า',required:['name'],fields:[
    {key:'name',label:'ชื่อลูกค้า',required:true,aliases:['ชื่อลูกค้า','ลูกค้า','ชื่อบริษัท','customer','customer name','customer_name','company name','name']},
    {key:'taxId',label:'เลขผู้เสียภาษี',aliases:['เลขผู้เสียภาษี','เลขประจำตัวผู้เสียภาษี','tax id','taxid','tax_id','vat id']},
    {key:'branchName',label:'ชื่อสาขา',aliases:['ชื่อสาขา','branch name','branch_name']},
    {key:'branchCode',label:'รหัสสาขา',aliases:['รหัสสาขา','branch code','branch_code']},
    {key:'address',label:'ที่อยู่',aliases:['ที่อยู่','address','customer address','billing address']},
    {key:'postalCode',label:'รหัสไปรษณีย์',aliases:['รหัสไปรษณีย์','postal code','postcode','zip','zip code']},
    {key:'contactPerson',label:'ผู้ติดต่อ',aliases:['ผู้ติดต่อ','ชื่อผู้ติดต่อ','contact','contact person','contact_name']},
    {key:'phone',label:'โทรศัพท์',aliases:['โทรศัพท์','เบอร์โทร','เบอร์โทรศัพท์','phone','tel','telephone','mobile']},
    {key:'email',label:'อีเมล',aliases:['อีเมล','email','e-mail']},
    {key:'creditDays',label:'เครดิต (วัน)',aliases:['เครดิต','เครดิตวัน','เครดิต (วัน)','credit','credit days','credit_days','payment term days']},
    {key:'agencyGroup',label:'กลุ่มหน่วยงาน',aliases:['กลุ่มหน่วยงาน','ประเภทหน่วยงาน','agency group','customer group']},
    {key:'agencyType',label:'ประเภทย่อยหน่วยงาน',aliases:['ประเภทย่อย','ประเภทย่อยหน่วยงาน','agency type','customer type']},
    {key:'note',label:'หมายเหตุ',aliases:['หมายเหตุ','note','notes','remark','remarks']}
  ]},
  supplier:{label:'Supplier / Manufacturer · ผู้จำหน่าย/ผู้ผลิต',required:['name'],fields:[
    {key:'name',label:'ชื่อผู้จำหน่าย / ผู้ผลิต',required:true,aliases:['ชื่อผู้จำหน่าย','ชื่อผู้ผลิต','ผู้จำหน่าย','ผู้ผลิต','supplier','supplier name','vendor','vendor name','manufacturer','manufacturer name','name']},
    {key:'taxId',label:'เลขผู้เสียภาษี',aliases:['เลขผู้เสียภาษี','เลขประจำตัวผู้เสียภาษี','tax id','taxid','tax_id','vat id']},
    {key:'address',label:'ที่อยู่',aliases:['ที่อยู่','address','supplier address','vendor address']},
    {key:'contactPerson',label:'ผู้ติดต่อ',aliases:['ผู้ติดต่อ','ชื่อผู้ติดต่อ','contact','contact person','contact_name']},
    {key:'phone',label:'โทรศัพท์',aliases:['โทรศัพท์','เบอร์โทร','เบอร์โทรศัพท์','phone','tel','telephone','mobile']},
    {key:'email',label:'อีเมล',aliases:['อีเมล','email','e-mail']},
    {key:'supplierCreditTerm',label:'เครดิตผู้ผลิต',aliases:['เครดิตผู้ผลิต','เครดิตผู้จำหน่าย','supplier credit','credit term','payment term','supplier_credit_term']},
    {key:'supplierLeadDays',label:'ระยะเวลาส่ง (วัน)',aliases:['ระยะเวลาส่ง','ระยะส่ง','lead days','lead time','supplier lead days','delivery days']},
    {key:'note',label:'หมายเหตุ',aliases:['หมายเหตุ','note','notes','remark','remarks']}
  ]},
  product:{label:'Product Master · สินค้า',required:['code','name'],fields:[
    {key:'code',label:'รหัสสินค้า / SKU',required:true,aliases:['รหัสสินค้า','รหัส','sku','product code','product_code','item code','code']},
    {key:'name',label:'ชื่อสินค้า',required:true,aliases:['ชื่อสินค้า','สินค้า','product','product name','product_name','item name','name']},
    {key:'category',label:'หมวดสินค้า',aliases:['หมวดสินค้า','หมวดหมู่','category','product category','product_category']},
    {key:'unit',label:'หน่วย',aliases:['หน่วย','unit','uom','unit name']},
    {key:'flowType',label:'ประเภท FlowAccount',aliases:['ประเภท flowaccount','flowaccount type','flow type','product type','inventory type','ประเภทสินค้า']},
    {key:'fulfillmentType',label:'รูปแบบงาน',aliases:['รูปแบบงาน','fulfillment','fulfillment type','stock type','การจัดหา','ประเภทการจัดหา']},
    {key:'openingStock',label:'ยอดตั้งต้น (เดิม/รวม)',aliases:['ยอดตั้งต้น','สต็อกตั้งต้น','opening stock','opening_stock','initial stock','beginning stock']},
    {key:'openingStockUbon',label:'ยอดตั้งต้นสำนักงานใหญ่',aliases:['ยอดตั้งต้นสำนักงานใหญ่','opening stock hq','opening stock head office','opening_stock_hq']},
    {key:'openingStockKhonkaen',label:'ยอดตั้งต้นสาขา 00001',aliases:['ยอดตั้งต้นสาขา 00001','ยอดตั้งต้นสาขาที่ 00001','opening stock branch','opening_stock_branch']},
    {key:'standardCost',label:'ต้นทุนมาตรฐาน',aliases:['ต้นทุนมาตรฐาน','standard cost','standard_cost','unit cost','cost']},
    {key:'reorderPoint',label:'จุดสั่งซื้อซ้ำ',aliases:['จุดสั่งซื้อซ้ำ','reorder point','reorder_point','minimum stock','min stock']},
    {key:'defaultSupplier',label:'ผู้จำหน่ายหลัก',aliases:['ผู้จำหน่ายหลัก','ผู้ผลิตหลัก','default supplier','supplier','vendor','manufacturer']}
  ]}
};
let csvImportState={fileName:'',headers:[],rows:[],delimiter:',',requestedType:'auto',effectiveType:'',mapping:{},validated:[],errors:[]};
function csvNormalizeHeader(value){return String(value??'').replace(/^\uFEFF/,'').toLowerCase().trim().replace(/[\s_\-\/().:]+/g,'');}
function csvDelimiterLabel(d){return d==='\t'?'Tab':d===';'?'Semicolon (;)':'Comma (,)';}
function parseCsvWithDelimiter(text,delimiter=','){
  const rows=[];let row=[],cell='',quoted=false;
  const src=String(text||'').replace(/^\uFEFF/,'');
  for(let i=0;i<src.length;i++){
    const ch=src[i];
    if(ch==='"'){
      if(quoted&&src[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    }else if(ch===delimiter&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&src[i+1]==='\n')i++;
      row.push(cell);cell='';
      if(row.some(v=>String(v).trim()!==''))rows.push(row);
      row=[];
    }else cell+=ch;
  }
  row.push(cell);if(row.some(v=>String(v).trim()!==''))rows.push(row);
  return rows;
}
function detectCsvDelimiter(text){
  const choices=[',',';','\t'];let best={delimiter:',',cols:0,rows:[]};
  choices.forEach(delimiter=>{const rows=parseCsvWithDelimiter(text,delimiter);const cols=rows[0]?.length||0;if(cols>best.cols)best={delimiter,cols,rows};});
  return best;
}
function detectCsvImportType(headers=[]){
  const norm=headers.map(csvNormalizeHeader);
  const scores={customer:0,supplier:0,product:0};
  Object.entries(CSV_IMPORT_SCHEMAS).forEach(([type,schema])=>schema.fields.forEach(field=>{
    const aliasSet=new Set([field.label,...field.aliases].map(csvNormalizeHeader));
    if(norm.some(h=>aliasSet.has(h)))scores[type]+=field.required?4:1;
  }));
  // Disambiguate common contact columns using explicit words.
  norm.forEach(h=>{
    if(['sku','productcode','รหัสสินค้า','ชื่อสินค้า','productname'].map(csvNormalizeHeader).includes(h))scores.product+=5;
    if(['supplier','suppliername','vendor','vendorname','manufacturer','manufacturername','ชื่อผู้จำหน่าย','ชื่อผู้ผลิต'].map(csvNormalizeHeader).includes(h))scores.supplier+=5;
    if(['customer','customername','ชื่อลูกค้า','ลูกค้า'].map(csvNormalizeHeader).includes(h))scores.customer+=5;
  });
  return Object.entries(scores).sort((a,b)=>b[1]-a[1])[0]?.[0]||'customer';
}
function autoMapCsvHeaders(type,headers=[]){
  const schema=CSV_IMPORT_SCHEMAS[type];const normalized=headers.map(csvNormalizeHeader);const mapping={};
  (schema?.fields||[]).forEach(field=>{
    const aliases=[field.label,...field.aliases].map(csvNormalizeHeader);
    let idx=normalized.findIndex(h=>aliases.includes(h));
    if(idx<0)idx=normalized.findIndex(h=>aliases.some(a=>a&&h&&(h.includes(a)||a.includes(h))));
    mapping[field.key]=idx>=0?String(idx):'';
  });
  return mapping;
}
function csvMappedRaw(row,key){const idx=csvImportState.mapping?.[key];return idx===''||idx===undefined?'':String(row?.[Number(idx)]??'').trim();}
function csvNumber(value){const n=Number(String(value??'').replace(/[,฿\s]/g,''));return Number.isFinite(n)?n:0;}
function normalizeCsvEntityType(value){const v=String(value||'').toLowerCase();return /(บุคคล|individual|person)/.test(v)?'individual':'company';}
function normalizeCsvCreditTerm(value){
  const raw=String(value||'').trim();const v=raw.toLowerCase().replace(/\s+/g,'');
  if(!raw)return'cash';
  if(/cash|เงินสด|0วัน/.test(v))return'cash';
  if(/deliverylead|ตามระยะส่ง/.test(v))return'deliveryLead';
  const day=(v.match(/(30|45|60|90|120|150|180)/)||[])[1];return day?`credit${day}`:raw;
}
function normalizeCsvLeadDays(value){return [...new Set(String(value||'').split(/[,;|/\s]+/).map(x=>Number(x)).filter(x=>Number.isFinite(x)&&x>0))].sort((a,b)=>a-b);}
function normalizeCsvFlowType(value){
  const v=String(value||'').toLowerCase().replace(/[\s_-]+/g,'');
  if(!v)return'';
  if(/service|บริการ/.test(v))return'service';
  if(/noninventory|ไม่นับสต็อก|ไม่นับstock/.test(v))return'non_inventory';
  if(/inventory|นับสต็อก|สินค้าคงคลัง|stock/.test(v))return'inventory';
  return'';
}
function normalizeCsvFulfillment(value){
  const v=String(value||'').toLowerCase().replace(/[\s_-]+/g,'');
  if(!v)return'';
  if(/service|บริการ/.test(v))return'service';
  if(/madetoorder|mto|สั่งผลิต|ผลิตตามสั่ง|สั่งซื้อเฉพาะงาน|ตามออเดอร์/.test(v))return'made_to_order';
  if(/stock|สต็อก|พร้อมส่ง|สินค้าคงคลัง/.test(v))return'stock';
  return'';
}
function csvBuildRecord(type,row,rowIndex){
  const raw=key=>csvMappedRaw(row,key);const issues=[];let record={};
  if(type==='customer'){
    const name=raw('name');if(!name)issues.push('ไม่มีชื่อลูกค้า');
    record={name,role:'customer',entityType:normalizeCsvEntityType(raw('entityType')),taxId:raw('taxId'),branchName:raw('branchName'),branchCode:raw('branchCode'),address:raw('address'),postalCode:raw('postalCode'),contactPerson:raw('contactPerson'),phone:raw('phone'),email:raw('email'),creditDays:Math.max(0,csvNumber(raw('creditDays'))),agencyGroup:raw('agencyGroup'),agencyType:raw('agencyType'),note:raw('note')};
  }else if(type==='supplier'){
    const name=raw('name');if(!name)issues.push('ไม่มีชื่อผู้จำหน่าย/ผู้ผลิต');
    record={name,role:'supplier',entityType:'company',taxId:raw('taxId'),address:raw('address'),contactPerson:raw('contactPerson'),phone:raw('phone'),email:raw('email'),supplierCreditTerm:normalizeCsvCreditTerm(raw('supplierCreditTerm')),supplierLeadDays:normalizeCsvLeadDays(raw('supplierLeadDays')),note:raw('note')};
  }else if(type==='product'){
    const code=raw('code'),name=raw('name');if(!code)issues.push('ไม่มีรหัสสินค้า');if(!name)issues.push('ไม่มีชื่อสินค้า');
    let flowType=normalizeCsvFlowType(raw('flowType'));let fulfillmentType=normalizeCsvFulfillment(raw('fulfillmentType'));
    if(!flowType){flowType=fulfillmentType==='service'?'service':fulfillmentType==='stock'?'inventory':'non_inventory';}
    if(!fulfillmentType)fulfillmentType=flowType==='service'?'service':flowType==='inventory'?'stock':'made_to_order';
    if(flowType==='service')fulfillmentType='service';
    const legacyOpening=Math.max(0,csvNumber(raw('openingStock'))),openingStockUbon=raw('openingStockUbon')!==''?Math.max(0,csvNumber(raw('openingStockUbon'))):legacyOpening,openingStockKhonkaen=Math.max(0,csvNumber(raw('openingStockKhonkaen')));record={code,name,category:raw('category')||'อื่น ๆ',unit:raw('unit')||'ชิ้น',flowType,fulfillmentType,openingStockUbon,openingStockKhonkaen,openingStock:openingStockUbon+openingStockKhonkaen,standardCost:Math.max(0,csvNumber(raw('standardCost'))),reorderPoint:Math.max(0,csvNumber(raw('reorderPoint'))),defaultSupplier:raw('defaultSupplier')};
  }
  return{rowIndex:rowIndex+2,record,issues,valid:issues.length===0};
}
function csvValidateCurrent(){
  const type=csvImportState.effectiveType;if(!type)return[];
  const schema=CSV_IMPORT_SCHEMAS[type];
  const missingMap=(schema.required||[]).filter(key=>csvImportState.mapping?.[key]==='');
  const validated=csvImportState.rows.map((row,i)=>csvBuildRecord(type,row,i));
  if(missingMap.length){validated.forEach(item=>{item.valid=false;item.issues.unshift('ยังไม่ได้จับคู่คอลัมน์จำเป็น');});}
  csvImportState.validated=validated;return validated;
}
function csvPreviewValue(value){if(Array.isArray(value))return value.join(', ');if(value===null||value===undefined||value==='')return'<span class="csv-cell-muted">—</span>';return escapeHtml(String(value));}
function renderCsvMapping(){
  const section=document.getElementById('csv-mapping-section'),grid=document.getElementById('csv-mapping-grid');if(!section||!grid)return;
  const type=csvImportState.effectiveType,schema=CSV_IMPORT_SCHEMAS[type];if(!schema){section.style.display='none';return;}
  section.style.display='block';
  const options='<option value="">— ไม่ใช้คอลัมน์นี้ —</option>'+csvImportState.headers.map((h,i)=>`<option value="${i}">${escapeHtml(h||`Column ${i+1}`)}</option>`).join('');
  grid.innerHTML=schema.fields.map(field=>`<div class="csv-map-field ${field.required?'is-required':''}"><label>${escapeHtml(field.label)}${field.required?' <em>*</em>':''}</label><select onchange="setCsvMapping('${field.key}',this.value)">${options}</select><small>${field.required?'จำเป็นสำหรับการ Import':'ไม่บังคับ'}</small></div>`).join('');
  schema.fields.forEach((field,i)=>{const select=grid.children[i]?.querySelector('select');if(select)select.value=csvImportState.mapping?.[field.key]??'';});
}
function renderCsvValidation(){
  const section=document.getElementById('csv-validation-section'),summary=document.getElementById('csv-validation-summary'),preview=document.getElementById('csv-preview-table'),btn=document.getElementById('csv-import-confirm');if(!section||!summary||!preview)return;
  const type=csvImportState.effectiveType,schema=CSV_IMPORT_SCHEMAS[type];if(!schema||!csvImportState.rows.length){section.style.display='none';if(btn)btn.disabled=true;return;}
  section.style.display='block';const rows=csvValidateCurrent();const valid=rows.filter(r=>r.valid),bad=rows.filter(r=>!r.valid);const duplicateKeys=new Set();const seen=new Set();
  rows.forEach(item=>{const key=type==='product'?normalizeProductKey(item.record.code||item.record.name):normalizeProductKey(item.record.name);if(key&&seen.has(key))duplicateKeys.add(key);else if(key)seen.add(key);});
  summary.innerHTML=`<div class="csv-stat"><small>แถวข้อมูล</small><b>${fmt(rows.length).replace('.00','')}</b></div><div class="csv-stat good"><small>พร้อม Import</small><b>${fmt(valid.length).replace('.00','')}</b></div><div class="csv-stat ${bad.length?'bad':'good'}"><small>มีข้อผิดพลาด</small><b>${fmt(bad.length).replace('.00','')}</b></div><div class="csv-stat ${duplicateKeys.size?'warn':'good'}"><small>คีย์ซ้ำในไฟล์</small><b>${fmt(duplicateKeys.size).replace('.00','')}</b></div>`;
  const displayFields=schema.fields.filter(f=>f.required||csvImportState.mapping?.[f.key]!=='').slice(0,8);
  preview.innerHTML=`<div class="csv-preview-wrap"><table class="csv-preview-table"><thead><tr><th>แถว</th><th>สถานะ</th>${displayFields.map(f=>`<th>${escapeHtml(f.label)}</th>`).join('')}<th>หมายเหตุ</th></tr></thead><tbody>${rows.slice(0,50).map(item=>`<tr class="${item.valid?'':'csv-row-error'}"><td>${item.rowIndex}</td><td><span class="csv-row-status ${item.valid?'ok':'bad'}">${item.valid?'พร้อม':'ตรวจสอบ'}</span></td>${displayFields.map(f=>`<td>${csvPreviewValue(item.record[f.key])}</td>`).join('')}<td class="${item.issues.length?'csv-cell-error':''}">${item.issues.length?escapeHtml(item.issues.join(' · ')):'ผ่านการตรวจ'}</td></tr>`).join('')}</tbody></table></div>${rows.length>50?`<div class="csv-map-note">แสดงตัวอย่าง 50 แถวแรกจากทั้งหมด ${rows.length.toLocaleString('th-TH')} แถว</div>`:''}`;
  const requiredMapped=(schema.required||[]).every(key=>csvImportState.mapping?.[key]!==''&&csvImportState.mapping?.[key]!==undefined);
  if(btn)btn.disabled=!requiredMapped||valid.length===0;
}
function setCsvMapping(key,value){csvImportState.mapping[key]=value;renderCsvValidation();}
function updateCsvFileSummary(){
  const el=document.getElementById('csv-import-file-summary');if(!el)return;
  if(!csvImportState.fileName){el.textContent='ยังไม่ได้เลือกไฟล์ CSV';return;}
  const schema=CSV_IMPORT_SCHEMAS[csvImportState.effectiveType];el.innerHTML=`ไฟล์ <b>${escapeHtml(csvImportState.fileName)}</b> · ${csvImportState.rows.length.toLocaleString('th-TH')} แถวข้อมูล · ${csvImportState.headers.length} คอลัมน์ · ตัวคั่น ${escapeHtml(csvDelimiterLabel(csvImportState.delimiter))} · ตรวจเป็น <b>${escapeHtml(schema?.label||'-')}</b>`;
}
function changeCsvImportType(value){
  csvImportState.requestedType=value||'auto';
  csvImportState.effectiveType=value==='auto'?detectCsvImportType(csvImportState.headers):value;
  csvImportState.mapping=autoMapCsvHeaders(csvImportState.effectiveType,csvImportState.headers);updateCsvFileSummary();renderCsvMapping();renderCsvValidation();
}
async function readCsvFileText(file){
  const buffer=await file.arrayBuffer();
  let text=new TextDecoder('utf-8').decode(buffer);
  const utfErrors=(text.match(/\uFFFD/g)||[]).length;
  if(utfErrors){
    try{
      const thai=new TextDecoder('windows-874').decode(buffer);
      const thaiErrors=(thai.match(/\uFFFD/g)||[]).length;
      if(thaiErrors<utfErrors)text=thai;
    }catch(_){/* Browser บางรุ่นอาจไม่รองรับ windows-874 */}
  }
  return text;
}
async function handleCsvImportFile(event){
  const file=event.target.files?.[0];if(!file)return;
  const status=document.getElementById('csv-import-status');if(status){status.textContent='กำลังอ่านไฟล์ CSV...';status.className='import-json-status working';}
  try{
    const text=await readCsvFileText(file);const detected=detectCsvDelimiter(text);const matrix=detected.rows;
    if(matrix.length<2)throw new Error('ไฟล์ต้องมีหัวคอลัมน์และข้อมูลอย่างน้อย 1 แถว');
    const headers=(matrix[0]||[]).map((h,i)=>String(h||'').trim()||`Column ${i+1}`);
    const rows=matrix.slice(1).filter(row=>row.some(v=>String(v).trim()!==''));
    csvImportState={fileName:file.name,headers,rows,delimiter:detected.delimiter,requestedType:document.getElementById('csv-import-type')?.value||'auto',effectiveType:'',mapping:{},validated:[],errors:[]};
    csvImportState.effectiveType=csvImportState.requestedType==='auto'?detectCsvImportType(headers):csvImportState.requestedType;
    csvImportState.mapping=autoMapCsvHeaders(csvImportState.effectiveType,headers);
    updateCsvFileSummary();renderCsvMapping();renderCsvValidation();
    if(status){status.textContent=`อ่านไฟล์สำเร็จ ${rows.length.toLocaleString('th-TH')} แถว · กรุณาตรวจ Mapping และ Preview ก่อน Import`;status.className='import-json-status success';}
  }catch(err){console.error(err);resetCsvImportWizard(false);if(status){status.textContent='อ่าน CSV ไม่สำเร็จ: '+(err?.message||err);status.className='import-json-status error';}}
}
function mergeCsvContactRows(type,records,mode='merge'){
  let rows=contactMasterRows();
  if(mode==='replace')rows=rows.flatMap(row=>{
    if(type==='customer'){
      if(row.role==='customer')return[];if(row.role==='both')return[{...row,role:'supplier'}];
    }else{
      if(row.role==='supplier')return[];if(row.role==='both')return[{...row,role:'customer'}];
    }
    return[row];
  });
  records.forEach((record,index)=>{
    const key=normalizeProductKey(record.name);if(!key)return;const idx=rows.findIndex(r=>normalizeProductKey(r.name)===key);const current=idx>=0?rows[idx]:{};
    let role=record.role;if(current.role&&current.role!==record.role&&current.role!=='both')role='both';else if(current.role==='both')role='both';
    const row={id:current.id||`contact-csv-${Date.now()}-${index}`,...current,...record,role,updatedAt:new Date().toISOString(),createdAt:current.createdAt||new Date().toISOString()};
    if(idx>=0)rows[idx]=row;else rows.push(row);
  });
  return writeLocalMaster(CONTACT_MASTER_KEY,rows);
}
function mergeCsvProductRows(records,mode='merge'){
  let rows=mode==='replace'?[]:readLocalMaster(PRODUCT_MASTER_LOCAL_KEY,[]).filter(Boolean);
  records.forEach((record,index)=>{
    const key=normalizeProductKey(record.code||record.name);const idx=rows.findIndex(r=>normalizeProductKey(r.code||r.name)===key);const current=idx>=0?rows[idx]:{};
    const row={id:current.id||`product-csv-${Date.now()}-${index}`,...current,...record,updatedAt:new Date().toISOString()};
    if(idx>=0)rows[idx]=row;else rows.push(row);
  });
  return writeLocalMaster(PRODUCT_MASTER_LOCAL_KEY,rows);
}
function commitCsvImport(){
  const type=csvImportState.effectiveType,schema=CSV_IMPORT_SCHEMAS[type];if(!schema)return notify('กรุณาเลือกประเภทข้อมูล CSV');
  const rows=csvValidateCurrent();const valid=rows.filter(r=>r.valid);if(!valid.length)return notify('ไม่มีแถวที่ผ่านการตรวจสำหรับ Import');
  const mode=document.getElementById('csv-import-mode')?.value||'merge';
  const bad=rows.length-valid.length;const ok=confirm(`นำเข้า ${schema.label}\nพร้อม Import ${valid.length.toLocaleString('th-TH')} แถว${bad?`\nข้าม ${bad.toLocaleString('th-TH')} แถวที่มีข้อผิดพลาด`:''}\nโหมด: ${mode==='replace'?'แทนที่ Master ประเภทนี้':'รวม/อัปเดตข้อมูลเดิม'}\n\nดำเนินการต่อหรือไม่?`);if(!ok)return;
  const status=document.getElementById('csv-import-status');if(status){status.textContent='กำลังนำเข้า CSV...';status.className='import-json-status working';}
  try{
    const records=valid.map(x=>x.record);const saved=type==='product'?mergeCsvProductRows(records,mode):mergeCsvContactRows(type,records,mode);
    if(!saved)throw new Error('ไม่สามารถบันทึก Master Data ลง localStorage ได้');
    refreshContactMasterDatalists();initProductMasterDatalist();renderMasterData();window.pcRenderInventory?.();populateProductionMakerDatalist?.();
    const msg=`Import CSV สำเร็จ: ${schema.label} ${records.length.toLocaleString('th-TH')} รายการ${bad?` · ข้าม ${bad.toLocaleString('th-TH')} แถว`:''}`;
    if(status){status.textContent=msg;status.className='import-json-status success';}notify(msg);
  }catch(err){console.error(err);const msg='Import CSV ไม่สำเร็จ: '+(err?.message||err);if(status){status.textContent=msg;status.className='import-json-status error';}notify(msg);}
}
function csvEscapeCell(value){const s=String(value??'');return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function downloadCsvText(filename,rows){const text='\uFEFF'+rows.map(row=>row.map(csvEscapeCell).join(',')).join('\r\n');const blob=new Blob([text],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
function downloadCsvTemplate(type){
  if(type==='customer')return downloadCsvText('customer-master-template.csv',[
    ['ชื่อลูกค้า','เลขผู้เสียภาษี','ชื่อสาขา','รหัสสาขา','ที่อยู่','รหัสไปรษณีย์','ผู้ติดต่อ','โทรศัพท์','อีเมล','เครดิต (วัน)','กลุ่มหน่วยงาน','ประเภทย่อยหน่วยงาน','หมายเหตุ'],
    ['โรงเรียนตัวอย่าง','0000000000000','สำนักงานใหญ่','00000','99 ถนนตัวอย่าง ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง','00000','คุณตัวอย่าง','000-000-0000','demo@example.com','30','โรงเรียน','','ข้อมูลตัวอย่าง']
  ]);
  if(type==='supplier')return downloadCsvText('supplier-master-template.csv',[
    ['ชื่อผู้จำหน่าย','เลขผู้เสียภาษี','ที่อยู่','ผู้ติดต่อ','โทรศัพท์','อีเมล','เครดิตผู้ผลิต','ระยะเวลาส่ง (วัน)','หมายเหตุ'],
    ['บริษัท ผู้ผลิตตัวอย่าง จำกัด','0000000000000','88 ถนนตัวอย่าง จังหวัดตัวอย่าง','คุณผู้ผลิต','000-000-0000','supplier@example.com','credit30','15,30','ข้อมูลตัวอย่าง']
  ]);
  return downloadCsvText('product-master-template.csv',[
    ['รหัสสินค้า','ชื่อสินค้า','หมวดสินค้า','หน่วย','ประเภท FlowAccount','รูปแบบงาน','ยอดตั้งต้นสำนักงานใหญ่','ยอดตั้งต้นสาขา 00001','ต้นทุนมาตรฐาน','จุดสั่งซื้อซ้ำ','ผู้จำหน่ายหลัก'],
    ['ST-001','สินค้าสต็อกตัวอย่าง','สินค้าไอที','ชิ้น','Inventory','สินค้าในสต็อก','70','30','8500','20','บริษัท ผู้ผลิตตัวอย่าง จำกัด'],
    ['MTO-001','สินค้าสั่งผลิตตัวอย่าง','งานผลิต','ชุด','Non-Inventory','สินค้าสั่งผลิต','0','0','0','0','บริษัท ผู้ผลิตตัวอย่าง จำกัด'],
    ['SV-001','บริการติดตั้งตัวอย่าง','บริการ','งาน','Service','บริการ','0','0','0','0','']
  ]);
}
function resetCsvImportWizard(clearInput=true){
  csvImportState={fileName:'',headers:[],rows:[],delimiter:',',requestedType:'auto',effectiveType:'',mapping:{},validated:[],errors:[]};
  if(clearInput){const input=document.getElementById('csv-import-file');if(input)input.value='';}
  const type=document.getElementById('csv-import-type');if(type)type.value='auto';
  const summary=document.getElementById('csv-import-file-summary');if(summary)summary.textContent='ยังไม่ได้เลือกไฟล์ CSV';
  const map=document.getElementById('csv-mapping-section');if(map)map.style.display='none';const val=document.getElementById('csv-validation-section');if(val)val.style.display='none';
  const btn=document.getElementById('csv-import-confirm');if(btn)btn.disabled=true;
  const status=document.getElementById('csv-import-status');if(status){status.textContent='CSV: ยังไม่มีการนำเข้าไฟล์';status.className='import-json-status';}
}

// ============================================================
// HELPERS
// ============================================================
function fmt(n){return Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});}

// Init date fields
['q-date','i-date','r-date','e-date','p-date'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=todayStr;});
refreshAutoDocumentNumber('quote',true);
refreshAutoDocumentNumber('invoice',true);
refreshAutoDocumentNumber('receipt',true);



// ============================================================
// INTERACTIVE TABLE SCROLLING
// เมาส์ลาก, คีย์บอร์ดลูกศร และการปัดบนหน้าจอสัมผัส
// ============================================================
let interactiveScrollObserver=null;
let interactiveScrollResizeObserver=null;

function getScrollAreaLabel(scroller){
  const card=scroller.closest('.card');
  const title=card?.querySelector('.card-title, .fsec')?.textContent?.trim();
  return title?`ตารางข้อมูล ${title}`:'ตารางข้อมูลที่เลื่อนได้';
}

function updateInteractiveScrollState(scroller){
  const canScrollX=scroller.scrollWidth>scroller.clientWidth+2;
  const canScrollY=scroller.scrollHeight>scroller.clientHeight+2;
  scroller.classList.toggle('drag-scroll-ready',canScrollX||canScrollY);
  scroller.dataset.canScrollX=canScrollX?'1':'0';
  scroller.dataset.canScrollY=canScrollY?'1':'0';
}

function enhanceInteractiveScrollArea(scroller){
  if(!(scroller instanceof HTMLElement)||scroller.dataset.interactiveScroll==='1')return;
  scroller.dataset.interactiveScroll='1';
  scroller.tabIndex=scroller.hasAttribute('tabindex')?scroller.tabIndex:0;
  scroller.setAttribute('role','region');
  scroller.setAttribute('aria-label',getScrollAreaLabel(scroller));
  scroller.setAttribute('title','ลากเมาส์เพื่อเลื่อน • ใช้ปุ่มลูกศรซ้าย/ขวา • บนมือถือปัดด้วยนิ้ว');

  const state={pressed:false,dragging:false,startX:0,startY:0,startLeft:0,startTop:0,pointerId:null,suppressClick:false};
  const interactiveSelector='button,a,input,select,textarea,label,[contenteditable="true"],[role="button"]';

  scroller.addEventListener('pointerdown',event=>{
    // ปล่อยให้มือถือ/แท็บเล็ตใช้การปัดตามธรรมชาติ และไม่แย่งการคลิกฟอร์ม
    if(event.pointerType!=='mouse'||event.button!==0||event.target.closest(interactiveSelector))return;
    if(scroller.dataset.canScrollX!=='1'&&scroller.dataset.canScrollY!=='1')return;
    state.pressed=true;
    state.dragging=false;
    state.startX=event.clientX;
    state.startY=event.clientY;
    state.startLeft=scroller.scrollLeft;
    state.startTop=scroller.scrollTop;
    state.pointerId=event.pointerId;
  });

  scroller.addEventListener('pointermove',event=>{
    if(!state.pressed||event.pointerId!==state.pointerId)return;
    const dx=event.clientX-state.startX;
    const dy=event.clientY-state.startY;
    if(!state.dragging&&Math.hypot(dx,dy)<5)return;
    if(!state.dragging){
      state.dragging=true;
      state.suppressClick=true;
      scroller.classList.add('drag-scroll-active');
      try{scroller.setPointerCapture(event.pointerId);}catch(_err){}
    }
    if(scroller.dataset.canScrollX==='1')scroller.scrollLeft=state.startLeft-dx;
    if(scroller.dataset.canScrollY==='1')scroller.scrollTop=state.startTop-dy;
    event.preventDefault();
  });

  const stopDragging=event=>{
    if(event&&state.pointerId!==null&&event.pointerId!==state.pointerId)return;
    state.pressed=false;
    state.dragging=false;
    scroller.classList.remove('drag-scroll-active');
    if(event&&state.pointerId!==null){
      try{scroller.releasePointerCapture(state.pointerId);}catch(_err){}
    }
    state.pointerId=null;
  };
  scroller.addEventListener('pointerup',stopDragging);
  scroller.addEventListener('pointercancel',stopDragging);
  scroller.addEventListener('lostpointercapture',stopDragging);
  scroller.addEventListener('mouseleave',()=>{
    if(state.pressed&&!state.dragging){
      state.pressed=false;
      state.pointerId=null;
    }
  });

  scroller.addEventListener('click',event=>{
    if(!state.suppressClick)return;
    state.suppressClick=false;
    event.preventDefault();
    event.stopPropagation();
  },true);

  scroller.addEventListener('keydown',event=>{
    const step=event.shiftKey?260:120;
    const pageStep=Math.max(180,Math.round(scroller.clientWidth*0.8));
    let handled=true;
    switch(event.key){
      case 'ArrowLeft': scroller.scrollBy({left:-step,behavior:'smooth'}); break;
      case 'ArrowRight': scroller.scrollBy({left:step,behavior:'smooth'}); break;
      case 'ArrowUp':
        if(scroller.dataset.canScrollY==='1')scroller.scrollBy({top:-step,behavior:'smooth'});else handled=false;
        break;
      case 'ArrowDown':
        if(scroller.dataset.canScrollY==='1')scroller.scrollBy({top:step,behavior:'smooth'});else handled=false;
        break;
      case 'PageUp': scroller.scrollBy({left:-pageStep,behavior:'smooth'}); break;
      case 'PageDown': scroller.scrollBy({left:pageStep,behavior:'smooth'}); break;
      case 'Home': scroller.scrollTo({left:0,behavior:'smooth'}); break;
      case 'End': scroller.scrollTo({left:scroller.scrollWidth,behavior:'smooth'}); break;
      default: handled=false;
    }
    if(handled)event.preventDefault();
  });

  // Shift + ล้อเมาส์ ใช้เลื่อนแนวนอนเพิ่มเติมสำหรับผู้ใช้เดสก์ท็อป
  scroller.addEventListener('wheel',event=>{
    if(!event.shiftKey||scroller.dataset.canScrollX!=='1')return;
    scroller.scrollLeft+=event.deltaY||event.deltaX;
    event.preventDefault();
  },{passive:false});

  updateInteractiveScrollState(scroller);
  interactiveScrollResizeObserver?.observe(scroller);
}

function initInteractiveScrollAreas(root=document){
  if(!interactiveScrollResizeObserver&&'ResizeObserver' in window){
    interactiveScrollResizeObserver=new ResizeObserver(entries=>{
      entries.forEach(entry=>updateInteractiveScrollState(entry.target));
    });
  }
  root.querySelectorAll?.('.tbl-wrap, .table-responsive').forEach(enhanceInteractiveScrollArea);

  if(!interactiveScrollObserver&&document.body){
    interactiveScrollObserver=new MutationObserver(mutations=>{
      mutations.forEach(mutation=>mutation.addedNodes.forEach(node=>{
        if(!(node instanceof HTMLElement))return;
        if(node.matches?.('.tbl-wrap, .table-responsive'))enhanceInteractiveScrollArea(node);
        node.querySelectorAll?.('.tbl-wrap, .table-responsive').forEach(enhanceInteractiveScrollArea);
      }));
    });
    interactiveScrollObserver.observe(document.body,{childList:true,subtree:true});
  }
}

// ============================================================
// EXPOSE INLINE HTML HANDLERS
// ============================================================
// index.html uses inline onclick/onchange/oninput attributes.
// When app.js is loaded as a Vite module, functions are not global by default.
// Expose only the handlers that the HTML needs so menu/buttons work after deployment.
function exposeInlineHandlers() {
  const handlers = {
    notify,
    go,
    switchDashTab,
    selBr,
    autoDetectCustomerAgency,
    populateCustomerAgencyTypeOptions,
    renderCustomerAgencyHint,
    populateAnalyticsAgencyTypeOptions,
    customerAgencyForRecord,
    addQItem,
    addIItem,
    addRItem,
    addPItem,
    calcQ,
    calcI,
    calcR,
    calcP,
    toggleCommMode,
    handleFiles,
    handleAttachmentPaste,
    resetF,
    resetProduction,
    saveQuote,
    saveInvoice,
    updateInvoiceDueDate,
    saveReceipt,
    editQuote,
    editInvoice,
    editReceipt,
    editProduction,
    cancelDocumentEdit,
    saveProduction,
    updateProductionSupplierDueDate,
    updateProductionDeliveryDueDate,
    handleProductionMakerChange,
    updateProductionSupplierPaymentStatus,
    saveExpense,
    fillFromInv,
    fillFromProduction,
    populateQuoteRefs,
    fillProductionFromQuote,
    useQuoteForProduction,
    previewQuoteDocumentFromForm,
    previewDeliveryDocumentFromForm,
    previewReceiptDocumentFromForm,
    openDeliveryDocumentFromInvoice,
    openReceiptDocumentFromReceipt,
    populateProductionRefs,
    populateInvRefs,
    useProductionForInvoice,
    markInvoicePaidByReceipt,
    delDoc,
    toggleApprove,
    toggleInvoicePaid,
    showDetail,
    showDetailById,
    openFile,
    openLocalAttachment,
    viewFile,
    rmFile,
    syncFromFirebaseYear,
    scheduleCloudSync,
    dedupeLocalYear,
    dedupeForListDisplay,
    renderDash,
    renderDashCharts,
    renderDataAnalytics,
    refreshDataAnalytics,
    renderSalesForecast,
    renderDeliveryTargetDashboard,
    saveDeliveryTarget,
    renderSalesTargetDashboard,
    saveSalesTarget,
    renderQLList,
    renderIList,
    renderRList,
    renderIssuedInvoiceList,
    renderIssuedReceiptList,
    showIssuedDocumentDetail,
    renderEList,
    renderPList,
    onYearChange,
    exportXLSX,
    exportSelectedMonthExcel,
    exportSelectedYearExcel,
    exportAllExcel,
    exportSelectedMonthJSON,
    exportSelectedYearJSON,
    exportAllJSON,
    importJSON,
    repairHistoricalImportData,
    createLocalBackupSnapshot,
    restoreLocalBackupSnapshot,
    listLocalBackups,
    closeModal
  };

  Object.entries(handlers).forEach(([name, fn]) => {
    if (typeof fn === 'function') window[name] = fn;
  });

  window.ComformSafety = {
    listLocalBackups,
    createLocalBackupSnapshot,
    restoreLocalBackupSnapshot,
    countLocalRowsByType,
    countCloudRowsByTypeForYear
  };

  window.ComformAppReady = true;
}

// Expose handlers immediately so inline onclick/onchange works even when app is loaded as a Vite module.
try {
  exposeInlineHandlers();
} catch (err) {
  console.error('Expose inline handlers failed:', err);
}


// ============================================================
// LINKED DOCUMENT WORKFLOW CENTER
// New business view:
// ใบเสนอราคา → รายการสั่งผลิต → ระยะเวลาในการส่งสินค้า → ใบส่งสินค้า / ใบกำกับภาษี
// → เครดิตการชำระของลูกค้า → ใบเสร็จรับเงิน
// ============================================================
let linkedBranch = '';

function linkedDocMonth(row={}){
  const direct=Number(row.monthIndex ?? row._m ?? row.month);
  if(Number.isFinite(direct) && direct>=0 && direct<=11)return direct;
  const d=parseFlexibleBusinessDate(row.date);
  return d?d.getMonth():0;
}
function linkedDocYear(row={}){
  const direct=Number(row.year ?? row._y ?? row.yearCE ?? row.yearBE ?? row.buddhistYear);
  if(Number.isFinite(direct))return direct>2400?direct-543:direct;
  const d=parseFlexibleBusinessDate(row.date);
  return d?d.getFullYear():now.getFullYear();
}
function linkedDocNo(row={}){return String(row.no||row.docNo||row.invNo||row.documentNo||'').trim();}
function linkedMatchNo(a,b){return a&&b&&String(a).trim()===String(b).trim();}
function linkedMoney(row={}){return roundMoneyValue(row.subtotal ?? row.saleTotal ?? row.itemSaleTotal ?? row.total ?? 0);}
function allLinkedRows(type,year){
  const localType=FIREBASE_COLLECTION_TO_LOCAL[type]||type;
  return docsForYear(localType,Number(year),null).map(x=>({...x,branch:x.branch||x._branch||'',year:linkedDocYear(x),monthIndex:linkedDocMonth(x)}));
}
function linkedReceiptMatchesInvoice(receipt={},invoice={},issuedInvoice={}){
  const receiptInvoiceNo=receipt.invNo||receipt.sourceInvoiceNo||receipt.invoiceNo||'';
  const invoiceNo=linkedDocNo(invoice||{});
  const issuedInvoiceNo=linkedDocNo(issuedInvoice||{});
  return linkedMatchNo(receiptInvoiceNo,invoiceNo)||linkedMatchNo(receiptInvoiceNo,issuedInvoiceNo)||linkedMatchNo(receipt.sourceReceiptNo,invoiceNo)||linkedMatchNo(receipt.sourceReceiptNo,issuedInvoiceNo);
}
function linkedReceiptMatchesProduction(receipt={},production={}){
  const pno=linkedDocNo(production||{});
  const pid=String(production?.firebaseId||production?.id||'');
  return (pid&&String(receipt.sourceProductionId||receipt.sourceProductionFirebaseId||'')===pid)||linkedMatchNo(receipt.sourceProductionNo,pno)||linkedMatchNo(receipt.productionNo,pno);
}
function buildLinkedChains(year){
  const quotes=allLinkedRows('quotes',year);
  const productions=allLinkedRows('productions',year).filter(x=>!x.historicalSalesImport);
  const invoices=allLinkedRows('invoices',year);
  const receipts=allLinkedRows('receipts',year);
  const issuedInvoices=allLinkedRows('issuedInvoices',year);
  const issuedReceipts=allLinkedRows('issuedReceipts',year);
  const usedQuotes=new Set();
  const usedInvoices=new Set();
  const usedReceipts=new Set();
  const chains=[];
  productions.forEach(prod=>{
    const pno=linkedDocNo(prod), pid=String(prod.firebaseId||prod.id||'');
    const quote=quotes.find(q=>{
      const qid=String(q.firebaseId||q.id||'');
      const ok=(prod.sourceQuoteId&&String(prod.sourceQuoteId)===String(q.id))||(prod.sourceQuoteFirebaseId&&String(prod.sourceQuoteFirebaseId)===qid)||linkedMatchNo(prod.sourceQuoteNo,linkedDocNo(q));
      if(ok)usedQuotes.add(String(q.firebaseId||q.id||linkedDocNo(q)));
      return ok;
    })||null;
    const invoice=invoices.find(inv=>{
      const ok=(pid&&String(inv.sourceProductionId||inv.sourceProductionFirebaseId||'')===pid)||linkedMatchNo(inv.sourceProductionNo,pno)||linkedMatchNo(prod.invoiceNo,linkedDocNo(inv));
      if(ok)usedInvoices.add(String(inv.firebaseId||inv.id||linkedDocNo(inv)));
      return ok;
    })||null;
    const ino=linkedDocNo(invoice||{});
    const issuedInvoice=issuedInvoices.find(x=>linkedMatchNo(x.sourceProductionNo,pno)||linkedMatchNo(x.sourceInvoiceNo,ino)||linkedMatchNo(linkedDocNo(x),ino))||null;
    const receipt=receipts.find(x=>linkedReceiptMatchesInvoice(x,invoice,issuedInvoice)||linkedReceiptMatchesProduction(x,prod))||null;
    if(receipt)usedReceipts.add(String(receipt.firebaseId||receipt.id||linkedDocNo(receipt)));
    const rno=linkedDocNo(receipt||{});
    const issuedReceipt=issuedReceipts.find(x=>linkedMatchNo(x.sourceInvoiceNo,ino)||linkedMatchNo(x.invNo,ino)||linkedMatchNo(x.sourceReceiptNo,rno)||linkedMatchNo(linkedDocNo(x),rno))||null;
    chains.push({quote,production:prod,invoice,issuedInvoice,receipt,issuedReceipt,branch:prod.branch||quote?.branch||invoice?.branch||receipt?.branch||'',year:linkedDocYear(prod),monthIndex:linkedDocMonth(prod),customer:prod.customer||quote?.customer||invoice?.customer||receipt?.customer||'',value:linkedMoney(prod)||linkedMoney(quote||{})||linkedMoney(invoice||{})||linkedMoney(receipt||{})});
  });
  // Keep invoice-only / receipt-only records visible so users can still discover older data that was not linked to a production record.
  invoices.forEach(inv=>{
    const key=String(inv.firebaseId||inv.id||linkedDocNo(inv)); if(usedInvoices.has(key))return;
    const ino=linkedDocNo(inv);
    const quote=quotes.find(q=>{
      const qid=String(q.firebaseId||q.id||'');
      const ok=(inv.sourceQuoteId&&String(inv.sourceQuoteId)===String(q.id))||(inv.sourceQuoteFirebaseId&&String(inv.sourceQuoteFirebaseId)===qid)||linkedMatchNo(inv.sourceQuoteNo,linkedDocNo(q));
      if(ok)usedQuotes.add(String(q.firebaseId||q.id||linkedDocNo(q)));
      return ok;
    })||null;
    const issuedInvoice=issuedInvoices.find(x=>linkedMatchNo(x.sourceInvoiceNo,ino)||linkedMatchNo(linkedDocNo(x),ino))||null;
    const receipt=receipts.find(x=>linkedReceiptMatchesInvoice(x,inv,issuedInvoice))||null;
    if(receipt)usedReceipts.add(String(receipt.firebaseId||receipt.id||linkedDocNo(receipt)));
    const issuedReceipt=issuedReceipts.find(x=>linkedMatchNo(x.sourceInvoiceNo,ino)||linkedMatchNo(x.invNo,ino)||linkedMatchNo(x.sourceReceiptNo,linkedDocNo(receipt||{})))||null;
    chains.push({quote,production:null,invoice:inv,issuedInvoice,receipt,issuedReceipt,branch:inv.branch||quote?.branch||receipt?.branch||'',year:linkedDocYear(inv),monthIndex:linkedDocMonth(inv),customer:inv.customer||quote?.customer||receipt?.customer||'',value:linkedMoney(inv)||linkedMoney(quote||{})||linkedMoney(receipt||{})});
  });
  receipts.forEach(receipt=>{
    const key=String(receipt.firebaseId||receipt.id||linkedDocNo(receipt)); if(usedReceipts.has(key))return;
    const rno=linkedDocNo(receipt);
    const issuedReceipt=issuedReceipts.find(x=>linkedMatchNo(x.sourceReceiptNo,rno)||linkedMatchNo(linkedDocNo(x),rno))||null;
    chains.push({quote:null,production:null,invoice:null,issuedInvoice:null,receipt,issuedReceipt,branch:receipt.branch||'',year:linkedDocYear(receipt),monthIndex:linkedDocMonth(receipt),customer:receipt.customer||'',value:linkedMoney(receipt)});
  });
  quotes.forEach(quote=>{
    const key=String(quote.firebaseId||quote.id||linkedDocNo(quote));if(usedQuotes.has(key))return;
    chains.push({quote,production:null,invoice:null,issuedInvoice:null,receipt:null,issuedReceipt:null,branch:quote.branch||'',year:linkedDocYear(quote),monthIndex:linkedDocMonth(quote),customer:quote.customer||'',value:linkedMoney(quote)});
  });
  return chains;
}
function linkedStage(label,row,kind,panel){
  if(!row)return `<div class="linked-stage is-wait"><div class="linked-stage-icon">○</div><div><small>${label}</small><b>รอดำเนินการ</b></div></div>`;
  const no=linkedDocNo(row)||'มีข้อมูล';
  return `<button type="button" class="linked-stage is-ok" onclick="openLinkedList('${panel}','${escapeHtml(row.branch||'')}',${linkedDocYear(row)},${linkedDocMonth(row)})"><div class="linked-stage-icon">✓</div><div><small>${label}</small><b>${escapeHtml(no)}</b><span>${escapeHtml(formatThaiDate(row.date))}</span></div></button>`;
}
function linkedInfoStage(label,{ok=false,title='',subtitle='',panel='',row=null}={}){
  const cls=ok?'is-ok':'is-wait';
  const icon=ok?'✓':'○';
  const content=`<div class="linked-stage-icon">${icon}</div><div><small>${escapeHtml(label)}</small><b>${escapeHtml(title||'รอดำเนินการ')}</b>${subtitle?`<span>${escapeHtml(subtitle)}</span>`:''}</div>`;
  if(ok&&panel&&row){
    return `<button type="button" class="linked-stage ${cls}" onclick="openLinkedList('${panel}','${escapeHtml(row.branch||'')}',${linkedDocYear(row)},${linkedDocMonth(row)})">${content}</button>`;
  }
  return `<div class="linked-stage ${cls}">${content}</div>`;
}
function linkedHasDeliveryLead(chain={}){
  const p=chain.production;
  if(!p)return false;
  return Boolean(normalizeProductionDeliveryLeadDays(p.deliveryLeadDays||p.shippingLeadDays)||getProductionDeliveryDueDate(p));
}
function linkedDeliveryLeadStage(chain={}){
  const p=chain.production;
  if(!p)return linkedInfoStage('ระยะเวลาในการส่งสินค้า',{ok:false,title:'ไม่มีรายการสั่งผลิต'});
  const days=normalizeProductionDeliveryLeadDays(p.deliveryLeadDays||p.shippingLeadDays);
  const due=getProductionDeliveryDueDate(p);
  if(!days&&!due)return linkedInfoStage('ระยะเวลาในการส่งสินค้า',{ok:false,title:'ยังไม่ระบุ'});
  const title=days?productionDeliveryLeadLabel(days):'ระบุแล้ว';
  const subtitle=due?`กำหนดส่ง ${formatThaiDate(due)}`:'';
  return linkedInfoStage('ระยะเวลาในการส่งสินค้า',{ok:true,title,subtitle,panel:'production-list',row:p});
}
function linkedCustomerCreditSource(chain={}){
  return chain.invoice||chain.issuedInvoice||null;
}
function linkedHasCustomerCredit(chain={}){
  const src=linkedCustomerCreditSource(chain);
  if(!src)return false;
  return Boolean(src.creditTerm||src.customerCreditTerm||src.paymentCreditTerm||src.dueDate||src.paymentDueDate);
}
function linkedCustomerCreditStage(chain={}){
  const src=linkedCustomerCreditSource(chain);
  if(!src)return linkedInfoStage('เครดิตการชำระของลูกค้า',{ok:false,title:'ยังไม่มีข้อมูลเครดิต'});
  const term=src.creditTerm||src.customerCreditTerm||src.paymentCreditTerm||'';
  const due=src.dueDate||src.paymentDueDate||getInvoiceDueDate(src);
  if(!term&&!due)return linkedInfoStage('เครดิตการชำระของลูกค้า',{ok:false,title:'ยังไม่ระบุเครดิต'});
  const title=invoiceCreditTermLabel(term)||term||'ระบุแล้ว';
  const subtitle=due?`ครบกำหนด ${formatThaiDate(due)}`:'';
  const panel=chain.invoice?'invoice-list':'issued-invoice-list';
  return linkedInfoStage('เครดิตการชำระของลูกค้า',{ok:true,title,subtitle,panel,row:src});
}
function populateLinkedFilters(){
  const y=document.getElementById('linked-year'),m=document.getElementById('linked-month'); if(!y||!m)return;
  const curY=y.value||String(now.getFullYear()),curM=m.value;
  const years=allYears(); if(!years.includes(now.getFullYear()))years.push(now.getFullYear());
  y.innerHTML=years.sort((a,b)=>b-a).map(v=>`<option value="${v}">พ.ศ. ${v+543}</option>`).join('');
  y.value=years.includes(Number(curY))?curY:String(years[0]);
  if(m.options.length<=1){MONTHS.forEach((name,i)=>m.insertAdjacentHTML('beforeend',`<option value="${i}">${name}</option>`));}
  m.value=curM;
}
function setLinkedBranch(branch,button){
  linkedBranch=branch||'';
  document.querySelectorAll('[data-linked-branch]').forEach(x=>x.classList.toggle('active',x===button));
  renderLinkedFlow();
}
function linkedStatus(chain){
  if(chain.production&&!linkedHasDeliveryLead(chain))return'pending-lead-time';
  if(!chain.invoice)return'pending-invoice';
  if(!linkedHasCustomerCredit(chain))return'pending-credit';
  if(!chain.receipt)return'pending-receipt';
  return'complete';
}
function renderLinkedFlow(){
  populateLinkedFilters();
  const year=Number(document.getElementById('linked-year')?.value||now.getFullYear());
  const month=document.getElementById('linked-month')?.value??'';
  const q=String(document.getElementById('linked-search')?.value||'').trim().toLowerCase();
  const status=document.getElementById('linked-status')?.value||'';
  let rows=buildLinkedChains(year).filter(x=>(!linkedBranch||x.branch===linkedBranch)&&(month===''||x.monthIndex===Number(month))&&(!status||linkedStatus(x)===status));
  if(q)rows=rows.filter(x=>[x.customer,x.quote?.no,(x.quote?.items||[]).map(i=>i.product).join(' '),x.production?.no,x.production?.job,x.invoice?.no,x.receipt?.no,x.issuedInvoice?.no,x.issuedReceipt?.no,x.invoice?.creditTerm,x.invoice?.dueDate,getProductionDeliveryDueDate(x.production),(x.production?.items||[]).map(i=>i.product).join(' '),(x.receipt?.items||[]).map(i=>i.product).join(' ')].join(' ').toLowerCase().includes(q));
  rows.sort((a,b)=>String(b.production?.date||b.invoice?.date||b.receipt?.date||b.quote?.date||'').localeCompare(String(a.production?.date||a.invoice?.date||a.receipt?.date||a.quote?.date||'')));
  const summary=document.getElementById('linked-summary'),list=document.getElementById('linked-flow-list'),empty=document.getElementById('linked-empty'); if(!summary||!list||!empty)return;
  const complete=rows.filter(x=>linkedStatus(x)==='complete').length;
  const pendingLead=rows.filter(x=>linkedStatus(x)==='pending-lead-time').length;
  const pendingInvoice=rows.filter(x=>linkedStatus(x)==='pending-invoice').length;
  const pendingCredit=rows.filter(x=>linkedStatus(x)==='pending-credit').length;
  const pendingReceipt=rows.filter(x=>linkedStatus(x)==='pending-receipt').length;
  const total=rows.reduce((s,x)=>s+x.value,0);
  summary.innerHTML=`<div><small>ทั้งหมด</small><b>${rows.length}</b><span>สายงาน</span></div><div><small>ครบทุกขั้นตอน</small><b>${complete}</b><span>รายการ</span></div><div><small>รอระยะเวลาส่ง</small><b>${pendingLead}</b><span>รายการ</span></div><div><small>รอใบส่งสินค้า / ใบกำกับภาษี</small><b>${pendingInvoice}</b><span>รายการ</span></div><div><small>รอเครดิตลูกค้า</small><b>${pendingCredit}</b><span>รายการ</span></div><div><small>รอใบเสร็จรับเงิน</small><b>${pendingReceipt}</b><span>รายการ</span></div><div><small>มูลค่ารวม</small><b>${fmt(total)}</b><span>บาท</span></div>`;
  list.innerHTML=rows.map((x,i)=>`<article class="linked-chain-card"><div class="linked-chain-head"><div><span class="linked-index">${i+1}</span><b>${escapeHtml(x.customer||'ไม่ระบุลูกค้า')}</b><small>${escapeHtml(BRANCH_TH[x.branch]||x.branch||'-')} · ${MONTHS[x.monthIndex]||'-'} พ.ศ. ${yearLabelDual(x.year)}</small></div><strong>฿${fmt(x.value)}</strong></div><div class="linked-stages">${linkedStage('ใบเสนอราคา',x.quote,'quote','quote-list')}<i>→</i>${linkedStage('รายการสั่งผลิต',x.production,'production','production-list')}<i>→</i>${linkedDeliveryLeadStage(x)}<i>→</i>${linkedStage('ใบส่งสินค้า / ใบกำกับภาษี',x.invoice,'invoice','invoice-list')}<i>→</i>${linkedCustomerCreditStage(x)}<i>→</i>${linkedStage('ใบเสร็จรับเงิน',x.receipt,'receipt','receipt-list')}</div></article>`).join('');
  empty.hidden=rows.length>0;
}
function openLinkedList(panel,branch,year,month){
  const map={'quote-list':['ql-br','ql-year','ql-month'],'production-list':['pl-br','pl-year','pl-month'],'invoice-list':['il-br','il-year','il-month'],'receipt-list':['rl-br','rl-year','rl-month'],'issued-invoice-list':['oil-br','oil-year','oil-month'],'issued-receipt-list':['orl-br','orl-year','orl-month']};
  const ids=map[panel]||[]; if(ids[0]&&document.getElementById(ids[0]))document.getElementById(ids[0]).value=branch||''; if(ids[1]&&document.getElementById(ids[1]))document.getElementById(ids[1]).value=String(year); if(ids[2]&&document.getElementById(ids[2]))document.getElementById(ids[2]).value=String(month);
  const nav=[...document.querySelectorAll('.nav-item')].find(x=>String(x.getAttribute('onclick')||'').includes(`'${panel}'`)); go(panel,nav||null);
}
async function refreshLinkedFlow(force=false){
  const year=Number(document.getElementById('linked-year')?.value||now.getFullYear());
  if(force){await syncFromFirebaseYear?.(year,{force:true}).catch(()=>{});} renderLinkedFlow();
}

// แจ้งเตือนเมื่อระบบ Safety Guard ป้องกันการล้างข้อมูล Local ที่น่าสงสัย
let lastSyncSafetyWarningAt=0;
window.addEventListener('comform-sync-safety-warning',event=>{
  const nowMs=Date.now();
  if(nowMs-lastSyncSafetyWarningAt<30000)return;
  lastSyncSafetyWarningAt=nowMs;
  const rows=event?.detail?.skippedTypes||[];
  const detail=rows.map(row=>`${row.type}: Local ${row.localCount} / Cloud ${row.cloudCount}`).join('\n');
  notify('ระบบป้องกันข้อมูลหาย: ไม่ได้ล้างข้อมูลในเครื่องบางประเภท เพราะข้อมูลบน Firebase ว่างหรือลดลงผิดปกติ\n\n'+detail+'\n\nกรุณาตรวจ Firebase ก่อนกด Sync แบบบังคับ');
});



const __docInlinePreviewState = { q: 'original', i: 'original', r: 'original' };
const __docInlinePreviewTimers = {};
function scheduleInlineDocumentPreview(prefix){
  clearTimeout(__docInlinePreviewTimers[prefix]);
  __docInlinePreviewTimers[prefix] = setTimeout(() => {
    if (prefix === 'q') renderQuoteInlinePreview();
    if (prefix === 'i') renderInvoiceInlinePreview();
    if (prefix === 'r') renderReceiptInlinePreview();
  }, 140);
}
function buildQuoteDraftForInlinePreview(){
  const b = getBr('q') || 'khonkaen';
  const date = document.getElementById('q-date')?.value || todayStr;
  const items = getQItems();
  const subtotal = items.reduce((sum,item)=>sum+safeNum(item.total),0);
  const useVat = parseInt(document.getElementById('q-vat')?.value || 0);
  const vatAmt = useVat ? subtotal * .07 : 0;
  return {
    id:'inline-quote', no: document.getElementById('q-no')?.value.trim() || refreshAutoQuoteNumber(), date: isoDateCEFromValue(date), branch:b,
    customer: document.getElementById('q-cust')?.value.trim() || '-', customerAddress:document.getElementById('q-address')?.value.trim()||'',customerTaxId:document.getElementById('q-tax-id')?.value.trim()||'',contact:document.getElementById('q-contact')?.value.trim()||'',phone:document.getElementById('q-phone')?.value.trim()||'',email:document.getElementById('q-email')?.value.trim()||'', ...getCustomerAgencyFromForm('q'), salesPerson: document.getElementById('q-sales')?.value.trim() || '',
    items: items.length ? items : [{ product:'', qty:0, unit:'ชิ้น', priceUnit:0, total:0 }], subtotal, useVat, vatAmt, total: subtotal + vatAmt,
    note: document.getElementById('q-note')?.value.trim() || '', attachments: attachedFiles['q-att'] || [], approved:false
  };
}
function buildInvoiceDraftForInlinePreview(){
  const b = getBr('i') || 'khonkaen';
  const date = document.getElementById('i-date')?.value || todayStr;
  const items = getIItems();
  const sourceProduction = getSelectedProductionRef();
  return {
    id:'inline-invoice', no: document.getElementById('i-no')?.value.trim() || refreshAutoDocumentNumber('invoice',true), date: isoDateCEFromValue(date), branch:b,
    customer: document.getElementById('i-cust')?.value.trim() || '-', customerAddress: document.getElementById('i-address')?.value?.trim?.() || '',
    customerTaxId: document.getElementById('i-tax-id')?.value?.trim?.() || '', contact: document.getElementById('i-contact')?.value?.trim?.() || '', phone: document.getElementById('i-phone')?.value?.trim?.() || '',
    ...getCustomerAgencyFromForm('i'), salesPerson: document.getElementById('i-sales')?.value.trim() || '', dueDate: document.getElementById('i-due-date')?.value || '', creditTerm: document.getElementById('i-credit-term')?.value || '',
    items: items.length ? items : [{ productCode:'', product:'', unit:'ชิ้น', qty:0, priceUnit:0 }], useVat: parseInt(document.getElementById('i-vat')?.value || 0), note: document.getElementById('i-note')?.value.trim() || '', attachments: attachedFiles['i-att'] || [], sourceProductionNo: sourceProduction?.no || ''
  };
}
function buildReceiptDraftForInlinePreview(){
  const b = getBr('r') || 'khonkaen';
  const date = document.getElementById('r-date')?.value || todayStr;
  const items = getRItems();
  const selectedInvoice = getSelectedInvoiceRef();
  return {
    id:'inline-receipt', no: document.getElementById('r-no')?.value.trim() || refreshAutoDocumentNumber('receipt',true), date: isoDateCEFromValue(date), branch:b,
    customer: document.getElementById('r-cust')?.value.trim() || '-', customerAddress: document.getElementById('r-address')?.value?.trim?.() || '',
    customerTaxId: document.getElementById('r-tax-id')?.value?.trim?.() || '', contact: document.getElementById('r-contact')?.value?.trim?.() || '', phone: document.getElementById('r-phone')?.value?.trim?.() || '',
    ...getCustomerAgencyFromForm('r'), salesPerson: document.getElementById('r-sales')?.value.trim() || '', invNo: document.getElementById('r-inv-no')?.value.trim() || (selectedInvoice?.no || ''),
    items: items.length ? items : [{ productCode:'', product:'', unit:'ชิ้น', qty:0, priceUnit:0 }], useVat: parseInt(document.getElementById('r-vat')?.value || 0), note: document.getElementById('r-note')?.value.trim() || '', attachments: attachedFiles['r-att'] || []
  };
}
const __docPreviewRetryCount = { q:0, i:0, r:0 };
function inlinePreviewLoading(target, prefix, label, retryFn){
  __docPreviewRetryCount[prefix] = (__docPreviewRetryCount[prefix] || 0) + 1;
  const count = __docPreviewRetryCount[prefix];
  if (count <= 30) {
    target.innerHTML = `<div class="doc-entry-empty"><b>กำลังโหลดตัวอย่าง${label}…</b><br><small>กำลังรอโมดูลเอกสาร (${count}/30)</small></div>`;
    setTimeout(retryFn, 180);
  } else {
    target.innerHTML = `<div class="doc-entry-empty doc-entry-preview-error"><b>ไม่สามารถโหลดตัวอย่าง${label}</b><br><small>โมดูลเอกสารยังไม่พร้อม กรุณากด Ctrl+F5 เพื่อรีเฟรชไฟล์ JavaScript หากเปิดจาก GitHub Pages ต้อง Deploy โฟลเดอร์ dist ที่ได้จาก npm run build</small><br><button type="button" class="btn btn-ghost btn-sm" onclick="window.retryDocumentPreviews?.()">ลองโหลดตัวอย่างอีกครั้ง</button></div>`;
  }
}
function renderQuoteInlinePreview(){
  const target = document.getElementById('q-inline-preview');
  if (!target) return;
  if (!window.ComformQuotationDocument?.renderInlinePreview) return inlinePreviewLoading(target,'q','ใบเสนอราคา',renderQuoteInlinePreview);
  __docPreviewRetryCount.q=0;
  try { window.ComformQuotationDocument.renderInlinePreview(target, buildQuoteDraftForInlinePreview(), { b: getBr('q') || 'khonkaen' }, __docInlinePreviewState.q || 'original'); }
  catch(error){ console.error('Quote inline preview failed',error); target.innerHTML=`<div class="doc-entry-empty doc-entry-preview-error"><b>ตัวอย่างใบเสนอราคาเกิดข้อผิดพลาด</b><br><small>${escapeHtml(error?.message||String(error))}</small></div>`; }
}
function renderInvoiceInlinePreview(){
  const target = document.getElementById('i-inline-preview');
  if (!target) return;
  if (!window.ComformDeliveryTaxDocument?.renderInlinePreview) return inlinePreviewLoading(target,'i','ใบส่งสินค้า / ใบกำกับภาษี',renderInvoiceInlinePreview);
  __docPreviewRetryCount.i=0;
  try { window.ComformDeliveryTaxDocument.renderInlinePreview(target, buildInvoiceDraftForInlinePreview(), { b: getBr('i') || 'khonkaen' }, __docInlinePreviewState.i || 'original'); }
  catch(error){ console.error('Invoice inline preview failed',error); target.innerHTML=`<div class="doc-entry-empty doc-entry-preview-error"><b>ตัวอย่างใบส่งสินค้า / ใบกำกับภาษีเกิดข้อผิดพลาด</b><br><small>${escapeHtml(error?.message||String(error))}</small></div>`; }
}
function renderReceiptInlinePreview(){
  const target = document.getElementById('r-inline-preview');
  if (!target) return;
  if (!window.ComformReceiptDocument?.renderInlinePreview) return inlinePreviewLoading(target,'r','ใบเสร็จรับเงิน',renderReceiptInlinePreview);
  __docPreviewRetryCount.r=0;
  try { window.ComformReceiptDocument.renderInlinePreview(target, buildReceiptDraftForInlinePreview(), { b: getBr('r') || 'khonkaen' }, __docInlinePreviewState.r || 'original'); }
  catch(error){ console.error('Receipt inline preview failed',error); target.innerHTML=`<div class="doc-entry-empty doc-entry-preview-error"><b>ตัวอย่างใบเสร็จรับเงินเกิดข้อผิดพลาด</b><br><small>${escapeHtml(error?.message||String(error))}</small></div>`; }
}
function retryDocumentPreviews(){
  __docPreviewRetryCount.q=0; __docPreviewRetryCount.i=0; __docPreviewRetryCount.r=0;
  scheduleInlineDocumentPreview('q'); scheduleInlineDocumentPreview('i'); scheduleInlineDocumentPreview('r');
}
window.retryDocumentPreviews=retryDocumentPreviews;
window.addEventListener('comform-document-module-ready', event=>{
  const name=event?.detail?.module;
  if(name==='quotation') { __docPreviewRetryCount.q=0; scheduleInlineDocumentPreview('q'); }
  if(name==='delivery') { __docPreviewRetryCount.i=0; scheduleInlineDocumentPreview('i'); }
  if(name==='receipt') { __docPreviewRetryCount.r=0; scheduleInlineDocumentPreview('r'); }
});
function runQuoteToolbarAction(action){
  if (action === 'save') return document.getElementById('q-save-btn')?.click();
  if (action === 'preview') return previewQuoteDocumentFromForm('modal');
  if (action === 'print') { previewQuoteDocumentFromForm(); setTimeout(()=>window.printQuote?.('current'), 450); return; }
  if (action === 'pdf') { previewQuoteDocumentFromForm(); setTimeout(()=>window.downloadQuotePdf?.(document.querySelector('#panel-quotation-document [data-qdoc-action="pdf-current"]') || null, 'current'), 650); return; }
}
function runInvoiceToolbarAction(action){
  if (action === 'save') return document.getElementById('i-save-btn')?.click();
  if (action === 'preview') return previewDeliveryDocumentFromForm('modal');
  if (action === 'print') { previewDeliveryDocumentFromForm(); setTimeout(()=>window.ComformDeliveryTaxDocument?.print?.('current'), 500); return; }
  if (action === 'pdf') { previewDeliveryDocumentFromForm(); setTimeout(()=>window.ComformDeliveryTaxDocument?.downloadPdf?.('all'), 700); return; }
}
function runReceiptToolbarAction(action){
  if (action === 'save') return document.getElementById('r-save-btn')?.click();
  if (action === 'preview') return previewReceiptDocumentFromForm('modal');
  if (action === 'print') { previewReceiptDocumentFromForm(); setTimeout(()=>window.ComformReceiptDocument?.print?.('current'), 500); return; }
  if (action === 'pdf') { previewReceiptDocumentFromForm(); setTimeout(()=>window.ComformReceiptDocument?.downloadPdf?.('all'), 700); return; }
}
function setupDocumentEntryWorkspace(options){
  const panel = document.getElementById(options.panelId);
  const card = panel?.querySelector('.card');
  if (!card || card.dataset.entryWorkspaceReady === '1') return;
  const title = card.querySelector('.card-title');
  const editBanner = card.querySelector('.edit-document-banner');
  const fg = card.querySelector('.fg');
  const hint = card.querySelector('.document-action-hint');
  const actions = card.querySelector('.form-actions');
  if (!title || !fg || !actions) return;
  const shell = document.createElement('div');
  shell.className = 'doc-entry-shell';
  const toolbar = document.createElement('div');
  toolbar.className = 'doc-entry-toolbar';
  const tenantCompanyName = window.CurrentUser?.tenantName || window.CurrentUser?.companyName || 'บริษัท';
  toolbar.innerHTML = `<div class="doc-entry-brand"><img src="logo.png" alt="โลโก้บริษัท"><div><small>${escapeHtml(tenantCompanyName)}</small><h2>${options.toolbarTitle}</h2></div></div><div class="doc-entry-toolbar-actions"><button type="button" class="btn ${options.saveBtnClass || 'btn-primary'}" data-doc-toolbar-action="save">💾 บันทึก</button><button type="button" class="btn btn-ghost" data-doc-toolbar-action="preview">👁 ดูตัวอย่าง</button><button type="button" class="btn btn-ghost" data-doc-toolbar-action="print">🖨️ พิมพ์</button><button type="button" class="btn btn-ghost" data-doc-toolbar-action="pdf">⬇ ดาวน์โหลด PDF</button></div>`;
  const workspace = document.createElement('div');
  workspace.className = 'doc-entry-workspace';
  const editor = document.createElement('section');
  editor.className = 'doc-entry-editor';
  const preview = document.createElement('section');
  preview.className = 'doc-entry-preview';
  preview.innerHTML = `<div class="doc-entry-preview-head"><div class="doc-entry-preview-title"><span class="dot"></span>ตัวอย่างเอกสารแบบเรียลไทม์</div><div class="doc-entry-zoom"><button type="button" data-zoom="out" title="ย่อ">－</button><button type="button" data-zoom="in" title="ขยาย">＋</button></div></div><div class="doc-entry-tabs" id="${options.prefix}-inline-tabs"></div><div class="doc-entry-tab-hint" id="${options.prefix}-inline-tab-hint"></div><div class="doc-entry-preview-frame"><div id="${options.prefix}-inline-preview" class="doc-entry-empty">กำลังโหลดตัวอย่างเอกสาร...</div></div>`;
  shell.appendChild(toolbar); shell.appendChild(workspace); workspace.appendChild(editor); workspace.appendChild(preview);
  const nodes = [editBanner, title, fg, hint, actions].filter(Boolean);
  card.innerHTML = '';
  card.appendChild(shell);
  nodes.forEach(node => editor.appendChild(node));
  toolbar.addEventListener('click', async event => {
    const btn = event.target.closest('[data-doc-toolbar-action]');
    const action = btn?.dataset.docToolbarAction;
    if (!action || btn.disabled) return;
    const busyLabel = {
      save: '⏳ กำลังบันทึก...',
      pdf: '⏳ กำลังสร้าง PDF...',
      print: '⏳ กำลังเตรียมพิมพ์...',
      preview: '⏳ กำลังโหลด...'
    }[action] || '⏳ กำลังทำงาน...';
    const originalLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = busyLabel;
    try {
      await options.toolbarAction(action);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalLabel;
    }
  });
  const tabAudience = {
    original: 'สำหรับลูกค้า — เอกสารตัวจริงที่มอบให้ลูกค้า',
    copy: 'สำหรับฝ่ายบัญชี — เก็บเข้าแฟ้มบัญชี/ภาษี',
    'account-copy': 'สำหรับฝ่ายบัญชี — เก็บเข้าแฟ้มบัญชี/ภาษี',
    'delivery-copy': 'สำหรับพนักงานส่งของ — เก็บไว้เป็นหลักฐานภายใน',
    'file-copy': 'เก็บไว้เป็นหลักฐาน — แนบไฟล์อ้างอิงภายใน'
  };
  const tabHint = document.getElementById(`${options.prefix}-inline-tab-hint`);
  const updateTabHint = () => {
    if (!tabHint) return;
    const current = __docInlinePreviewState[options.prefix] || options.tabs[0]?.id;
    tabHint.textContent = tabAudience[current] || '';
  };
  const tabs = document.getElementById(`${options.prefix}-inline-tabs`);
  tabs.innerHTML = options.tabs.map(tab => `<button type="button" data-copy="${tab.id}" class="${tab.id === __docInlinePreviewState[options.prefix] ? 'active' : ''}">${tab.label}</button>`).join('');
  updateTabHint();
  tabs.addEventListener('click', event => {
    const button = event.target.closest('button[data-copy]');
    if (!button) return;
    __docInlinePreviewState[options.prefix] = button.dataset.copy || options.tabs[0].id;
    [...tabs.querySelectorAll('button')].forEach(btn => btn.classList.toggle('active', btn === button));
    updateTabHint();
    scheduleInlineDocumentPreview(options.prefix);
  });
  const zoomLevels = [.5, .66, .82, 1];
  let zoomIndex = 1;
  const applyZoom = () => preview.style.setProperty('--doc-preview-scale', zoomLevels[zoomIndex]);
  applyZoom();
  preview.querySelector('.doc-entry-zoom').addEventListener('click', event => {
    const dir = event.target.closest('[data-zoom]')?.dataset.zoom;
    if (!dir) return;
    zoomIndex = dir === 'in' ? Math.min(zoomIndex + 1, zoomLevels.length - 1) : Math.max(zoomIndex - 1, 0);
    applyZoom();
  });
  card.dataset.entryWorkspaceReady = '1';
  panel.addEventListener('input', () => scheduleInlineDocumentPreview(options.prefix));
  panel.addEventListener('change', () => scheduleInlineDocumentPreview(options.prefix));
  panel.addEventListener('click', event => {
    if (event.target.closest('.btn') || event.target.closest('.br-opt') || event.target.closest('.file-preview') || event.target.closest('.upload-zone')) {
      scheduleInlineDocumentPreview(options.prefix);
    }
  });
  setTimeout(() => scheduleInlineDocumentPreview(options.prefix), 100);
}
function initDocumentEntryWorkspaces(){
  setupDocumentEntryWorkspace({ panelId:'panel-quote-form', prefix:'q', toolbarTitle:'ออกใบเสนอราคา', saveBtnClass:'btn-primary', toolbarAction:runQuoteToolbarAction, tabs:[{id:'original',label:'ต้นฉบับ/ORIGINAL'},{id:'copy',label:'สำเนา/COPY'}] });
  setupDocumentEntryWorkspace({ panelId:'panel-invoice-form', prefix:'i', toolbarTitle:'ออกใบส่งสินค้า / ใบกำกับภาษี', saveBtnClass:'btn-primary', toolbarAction:runInvoiceToolbarAction, tabs:[{id:'original',label:'ต้นฉบับ/ORIGINAL'},{id:'copy',label:'สำเนา/COPY'},{id:'delivery-copy',label:'สำเนาใบส่งสินค้า/สำเนาใบกำกับภาษี'}] });
  setupDocumentEntryWorkspace({ panelId:'panel-receipt-form', prefix:'r', toolbarTitle:'ออกใบเสร็จรับเงิน', saveBtnClass:'btn-purple', toolbarAction:runReceiptToolbarAction, tabs:[{id:'original',label:'ต้นฉบับ/ORIGINAL'},{id:'account-copy',label:'สำเนาบัญชี'},{id:'file-copy',label:'สำเนาเก็บหลักฐาน'}] });
}

// ============================================================
// BOOT
// ============================================================

function migrateLegacyIssuedDocuments(){
  allYears().forEach(year=>{
    tenantActiveBranchIds().forEach(branch=>{
      for(let month=0;month<12;month++){
        const data=loadFor(branch,year,month);
        const oldInvoices=data.invoices||[];
        const oldReceipts=data.receipts||[];
        const movedInvoices=oldInvoices.filter(row=>row?.documentKind==='delivery-tax-invoice');
        const movedReceipts=oldReceipts.filter(row=>row?.documentKind==='receipt-document');
        if(!movedInvoices.length&&!movedReceipts.length)continue;
        data.invoices=oldInvoices.filter(row=>row?.documentKind!=='delivery-tax-invoice');
        data.receipts=oldReceipts.filter(row=>row?.documentKind!=='receipt-document');
        data.issuedInvoices=dedupeRecords([...(data.issuedInvoices||[]),...movedInvoices.map(row=>({...row,storageCollection:row.storageCollection||'invoices'}))]);
        data.issuedReceipts=dedupeRecords([...(data.issuedReceipts||[]),...movedReceipts.map(row=>({...row,storageCollection:row.storageCollection||'receipts'}))]);
        saveFor(branch,year,month,data);
      }
    });
  });
}

Object.assign(window,{loadFor,saveFor,productMasterRows,productMasterMeta,productEstimatedStock,productOpeningStock,productSoldQty,findContactMaster,contactMasterRows,applySuggestedQuotePrice,docsForYear,docsFor,allYears,renderLinkedFlow,setLinkedBranch,openLinkedList,refreshLinkedFlow,renderDataAnalytics,refreshDataAnalytics,applyProductMasterToInput,applyProductionProductPreset,applyCustomerDemo,useAutoDocumentNumber,refreshAutoDocumentNumber,handleDocumentDateChange,switchMasterTab,renderMasterData,saveCustomerMaster,saveSupplierMaster,saveProductMasterLocal,resetCustomerMasterForm,resetSupplierMasterForm,resetProductMasterForm,editContactMaster,deleteContactMaster,editProductMasterLocal,deleteProductMasterLocal,handleCustomerMasterInput,applyCustomerMasterToForm,rememberCustomerFromForm,rememberSupplierFromProduction,syncProductFulfillmentFromFlowType,handleCsvImportFile,changeCsvImportType,setCsvMapping,commitCsvImport,downloadCsvTemplate,resetCsvImportWizard});

function bootComformApp() {
  exposeInlineHandlers();

  try {
    migrateLegacyIssuedDocuments();
    initDropdowns();
    initProductMasterDatalist();
    initMasterData();
    initCustomerAgencyControls();
    initCustomerDemoMaster();
    initAutoDocumentNumberControls();
    populateProductionMakerDatalist();
    initExportControls();
    initInteractiveScrollAreas();
    initAttachmentPasteZones();
    initDocumentEntryWorkspaces();
    renderDash();
    renderDataAnalytics();
    addQItem();
    addIItem();
    updateInvoiceDueDate();
    addRItem();
    addPItem({qty:1,unit:'กล่อง'});
    updateProductionSupplierDueDate();
    updateProductionDeliveryDueDate();
    calcP();
    // เผื่อ comform-auth-ready เกิดก่อน app.js โหลดเสร็จ ให้ลอง sync อีกครั้งหลัง boot
    setTimeout(() => scheduleCloudSync(getCurrentSelectedYear()), 600);
  } catch (err) {
    console.error('Comform app boot failed:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootComformApp);
} else {
  bootComformApp();
}


// เมื่อ Login สำเร็จ ถ้าเป็นพนักงานสาขาเดียว ให้ล็อกสาขาอัตโนมัติ
let cloudAutoSyncInterval=null;
window.addEventListener('comform-auth-ready', () => {
  try {
    lockBranchForStaff();
    scheduleCloudSync(getCurrentSelectedYear());
    clearInterval(cloudAutoSyncInterval);
    cloudAutoSyncInterval=setInterval(()=>{
      if(!document.hidden) scheduleCloudSync(getCurrentSelectedYear());
    },60000);
  } catch (err) {
    console.warn('ตั้งค่าสาขาหลัง Login ไม่สำเร็จ', err);
  }
});


if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',()=>setTimeout(refreshExpenseEvidenceUi,0));}else{setTimeout(refreshExpenseEvidenceUi,0);}


// Multi-tenant cache refresh: after Firebase resolves the company/tenant, re-read
// tenant-scoped local data instead of data that may have initialized anonymously.
window.addEventListener('comform-auth-ready',async()=>{
  try{await hydrateTenantMasterFromCloud();}catch(_){}
  try{window.renderMasterData?.();}catch(_){}
  try{renderDashboard?.();}catch(_){}
  try{renderDataAnalytics?.();}catch(_){}
});
