// =====================================================================
// business-rules.js — Tenant-scoped Business Rule / Formula Lab
// =====================================================================
// Purpose:
// - Allow each tenant to keep its own pricing/commission policy.
// - Avoid hard-coded company-specific if/else blocks in app.js.
// - Store formula versions so old documents can preserve calculation context.
// - Trial module only: taxes remain system-controlled; arbitrary JS formulas are NOT evaluated.

const RULES_STORAGE_KEY = 'comform_business_rules_v1';
const CONTACT_KEY = 'comform_contact_master_v1';
const PRODUCT_KEY = 'comform_product_master_v1';
const MAX_HISTORY = 20;

const money = new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',minimumFractionDigits:2,maximumFractionDigits:2});
const num = new Intl.NumberFormat('th-TH',{maximumFractionDigits:2});
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,n(v)));
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const tenantKey=base=>window.ComformTenant?.storageKey?.(base)||`erp_tenant::anonymous::${base}`;
const tenantId=()=>window.ComformTenant?.getActiveTenantId?.()||window.CurrentUser?.tenantId||'anonymous';

const PRESETS={
  made_to_order:{
    name:'ธุรกิจงานสั่งผลิต',tag:'Made-to-order',description:'เหมาะกับงานผลิตตามคำสั่งซื้อ งานพิมพ์ งานประกอบ หรืองานที่มีค่าแรง/ออกแบบเพิ่ม',
    policy:{pricingMethod:'markup_on_cost',rate:30,defaultCustomerDiscount:0,commissionMethod:'net_sales',commissionRate:3,costComponents:{shipping:true,labor:true,design:true,other:true}},
    lab:{baseCost:18000,shipping:1200,labor:2500,design:1500,other:500,discount:3,qty:1,product:'MTO-002',customer:'โรงเรียนตัวอย่าง'},
    contacts:[
      {id:'trial-c-mto-1',name:'โรงเรียนตัวอย่าง',role:'customer',entityType:'company',address:'99 ถนนตัวอย่าง จังหวัดตัวอย่าง',taxId:'0000000000000',contactPerson:'ฝ่ายพัสดุ',phone:'000-000-0000',email:'school@example.com',creditDays:30,note:'ข้อมูลสมมติสำหรับ Trial'},
      {id:'trial-s-mto-1',name:'โรงงานผลิตตัวอย่าง จำกัด',role:'supplier',entityType:'company',address:'88 ถนนโรงงาน จังหวัดตัวอย่าง',taxId:'0000000000000',contactPerson:'ฝ่ายขาย',phone:'000-000-0000',email:'factory@example.com',supplierCreditTerm:'credit30',supplierLeadDays:[14,30],note:'ข้อมูลสมมติสำหรับ Trial'}
    ],
    products:[
      {id:'trial-p-mto-1',code:'MTO-001',name:'งานผลิตป้ายประชาสัมพันธ์',category:'งานสั่งผลิต',unit:'งาน',flowType:'non_inventory',fulfillmentType:'made_to_order',standardCost:18000,defaultSupplier:'โรงงานผลิตตัวอย่าง จำกัด',openingStockUbon:0,openingStockKhonkaen:0,reorderPoint:0},
      {id:'trial-p-mto-2',code:'MTO-002',name:'งานพิมพ์สื่อประชาสัมพันธ์',category:'งานสั่งผลิต',unit:'งาน',flowType:'non_inventory',fulfillmentType:'made_to_order',standardCost:9500,defaultSupplier:'โรงงานผลิตตัวอย่าง จำกัด',openingStockUbon:0,openingStockKhonkaen:0,reorderPoint:0}
    ],
    productRules:[{key:'MTO-002',label:'MTO-002 · งานพิมพ์สื่อประชาสัมพันธ์',pricingMethod:'markup_on_cost',rate:35}],customerRules:[{key:'โรงเรียนตัวอย่าง',label:'โรงเรียนตัวอย่าง',discountPercent:3}]
  },
  stock_it:{
    name:'ธุรกิจสินค้าในสต็อก',tag:'Inventory',description:'เหมาะกับร้าน/บริษัทที่ซื้อสินค้าเข้าคลังและขายต่อ โดยต้องควบคุม Margin และส่วนลดลูกค้า',
    policy:{pricingMethod:'target_margin',rate:18,defaultCustomerDiscount:2,commissionMethod:'gross_profit',commissionRate:10,costComponents:{shipping:true,labor:false,design:false,other:true}},
    lab:{baseCost:22000,shipping:450,labor:0,design:0,other:150,discount:5,qty:2,product:'IT-TRIAL-02',customer:'บริษัทลูกค้าไอทีตัวอย่าง จำกัด'},
    contacts:[
      {id:'trial-c-stock-1',name:'บริษัทลูกค้าไอทีตัวอย่าง จำกัด',role:'customer',entityType:'company',address:'55 ถนนธุรกิจ จังหวัดตัวอย่าง',taxId:'0000000000000',contactPerson:'ฝ่ายจัดซื้อ',phone:'000-000-0000',email:'buyer@example.com',creditDays:45,note:'ข้อมูลสมมติสำหรับ Trial'},
      {id:'trial-s-stock-1',name:'ดิสทริบิวเตอร์ไอทีตัวอย่าง จำกัด',role:'supplier',entityType:'company',address:'44 ถนนคลังสินค้า จังหวัดตัวอย่าง',taxId:'0000000000000',contactPerson:'ฝ่ายขายองค์กร',phone:'000-000-0000',email:'dist@example.com',supplierCreditTerm:'credit30',supplierLeadDays:[3,7],note:'ข้อมูลสมมติสำหรับ Trial'}
    ],
    products:[
      {id:'trial-p-stock-1',code:'IT-TRIAL-01',name:'Notebook Business Series',category:'คอมพิวเตอร์และอุปกรณ์',unit:'เครื่อง',flowType:'inventory',fulfillmentType:'stock',standardCost:22000,defaultSupplier:'ดิสทริบิวเตอร์ไอทีตัวอย่าง จำกัด',openingStockUbon:20,openingStockKhonkaen:5,reorderPoint:5},
      {id:'trial-p-stock-2',code:'IT-TRIAL-02',name:'Network Switch 24 Port',category:'ระบบเครือข่าย',unit:'ตัว',flowType:'inventory',fulfillmentType:'stock',standardCost:6800,defaultSupplier:'ดิสทริบิวเตอร์ไอทีตัวอย่าง จำกัด',openingStockUbon:12,openingStockKhonkaen:3,reorderPoint:3}
    ],
    productRules:[{key:'IT-TRIAL-02',label:'IT-TRIAL-02 · Network Switch 24 Port',pricingMethod:'target_margin',rate:22}],customerRules:[{key:'บริษัทลูกค้าไอทีตัวอย่าง จำกัด',label:'บริษัทลูกค้าไอทีตัวอย่าง จำกัด',discountPercent:5}]
  },
  service:{
    name:'ธุรกิจบริการ',tag:'Service',description:'เหมาะกับติดตั้ง บำรุงรักษา อบรม หรือบริการที่ต้นทุนหลักมาจากแรงงานและค่าใช้จ่ายหน้างาน',
    policy:{pricingMethod:'markup_on_cost',rate:45,defaultCustomerDiscount:0,commissionMethod:'net_sales',commissionRate:5,costComponents:{shipping:true,labor:true,design:false,other:true}},
    lab:{baseCost:2000,shipping:500,labor:6000,design:0,other:750,discount:2,qty:1,product:'SV-TRIAL-01',customer:'โรงพยาบาลตัวอย่าง'},
    contacts:[
      {id:'trial-c-service-1',name:'โรงพยาบาลตัวอย่าง',role:'customer',entityType:'company',address:'77 ถนนสุขภาพ จังหวัดตัวอย่าง',taxId:'0000000000000',contactPerson:'ฝ่ายเทคโนโลยี',phone:'000-000-0000',email:'hospital@example.com',creditDays:30,note:'ข้อมูลสมมติสำหรับ Trial'},
      {id:'trial-s-service-1',name:'ผู้รับเหมาช่วงตัวอย่าง จำกัด',role:'supplier',entityType:'company',address:'66 ถนนบริการ จังหวัดตัวอย่าง',taxId:'0000000000000',contactPerson:'ผู้ประสานงาน',phone:'000-000-0000',email:'subcontract@example.com',supplierCreditTerm:'credit30',supplierLeadDays:[7],note:'ข้อมูลสมมติสำหรับ Trial'}
    ],
    products:[
      {id:'trial-p-service-1',code:'SV-TRIAL-01',name:'บริการติดตั้งและตั้งค่าระบบ',category:'บริการ',unit:'งาน',flowType:'service',fulfillmentType:'service',standardCost:8250,defaultSupplier:'ผู้รับเหมาช่วงตัวอย่าง จำกัด',openingStockUbon:0,openingStockKhonkaen:0,reorderPoint:0},
      {id:'trial-p-service-2',code:'SV-TRIAL-02',name:'บริการบำรุงรักษาระบบรายครั้ง',category:'บริการ',unit:'ครั้ง',flowType:'service',fulfillmentType:'service',standardCost:3500,defaultSupplier:'ผู้รับเหมาช่วงตัวอย่าง จำกัด',openingStockUbon:0,openingStockKhonkaen:0,reorderPoint:0}
    ],
    productRules:[],customerRules:[{key:'โรงพยาบาลตัวอย่าง',label:'โรงพยาบาลตัวอย่าง',discountPercent:2}]
  }
};

let draftPolicy=null;
function pricingRate(method,value){return method==='fixed_price'?Math.max(0,n(value)):clamp(value,0,95)}
function basePolicy(){
  return {schemaVersion:1,formulaVersion:1,pricingMethod:'markup_on_cost',rate:25,defaultCustomerDiscount:0,commissionMethod:'none',commissionRate:0,costComponents:{shipping:true,labor:true,design:true,other:true},productRules:[],customerRules:[],history:[],updatedAt:new Date().toISOString()};
}
function readRules(){
  try{const raw=localStorage.getItem(tenantKey(RULES_STORAGE_KEY));return raw?{...basePolicy(),...JSON.parse(raw)}:basePolicy();}catch(_){return basePolicy();}
}
function writeRules(policy,{skipCloud=false}={}){
  const clean={...basePolicy(),...policy,tenantId:tenantId(),companyId:tenantId(),updatedAt:new Date().toISOString()};
  localStorage.setItem(tenantKey(RULES_STORAGE_KEY),JSON.stringify(clean));
  if(!skipCloud&&window.FirebaseService?.configured&&window.FirebaseService?.saveBusinessRules){window.FirebaseService.saveBusinessRules(clean).catch(err=>setStatus('Cloud sync สูตรไม่สำเร็จ: '+(err?.message||err),'warn'));}
  return clean;
}
function policySignature(p){
  return JSON.stringify({pricingMethod:p.pricingMethod,rate:n(p.rate),defaultCustomerDiscount:n(p.defaultCustomerDiscount),commissionMethod:p.commissionMethod,commissionRate:n(p.commissionRate),costComponents:p.costComponents,productRules:p.productRules||[],customerRules:p.customerRules||[]});
}
function saveFromForm(){
  const current=readRules();
  const method=value('br-pricing-method');
  const base=draftPolicy||current;
  const next={...current,pricingMethod:method,rate:pricingRate(method,value('br-rate')),defaultCustomerDiscount:clamp(value('br-default-discount'),0,100),commissionMethod:value('br-commission-method'),commissionRate:clamp(value('br-commission-rate'),0,100),costComponents:{shipping:checked('br-cost-shipping'),labor:checked('br-cost-labor'),design:checked('br-cost-design'),other:checked('br-cost-other')},productRules:base.productRules||[],customerRules:base.customerRules||[]};
  if(policySignature(next)!==policySignature(current)){
    const history=[...(current.history||[]),{version:current.formulaVersion||1,savedAt:current.updatedAt||new Date().toISOString(),pricingMethod:current.pricingMethod,rate:current.rate,commissionMethod:current.commissionMethod,commissionRate:current.commissionRate}].slice(-MAX_HISTORY);
    next.formulaVersion=(current.formulaVersion||1)+1;next.history=history;
  }
  writeRules(next);draftPolicy=null;renderAll();setStatus(`บันทึก Business Rules เวอร์ชัน BR-${String(next.formulaVersion).padStart(3,'0')} สำหรับบริษัทนี้แล้ว`,'ok');
}
function loadPreset(key,{seed=false}={}){
  const preset=PRESETS[key];if(!preset)return;
  document.querySelectorAll('[data-br-preset]').forEach(x=>x.classList.toggle('active',x.dataset.brPreset===key));
  const current=readRules();
  const merged={...current,...preset.policy,productRules:preset.productRules.map(x=>({...x})),customerRules:preset.customerRules.map(x=>({...x})),activePreset:key};
  draftPolicy=merged;
  setPolicyForm(merged);setLab(preset.lab);renderRulesTables(merged);calculateLab();
  if(seed){
    const updated=savePresetAsNewVersion(merged);draftPolicy=null;
    seedMasterData(preset);
    setStatus(`โหลดข้อมูลสมมติ “${preset.name}” ลง Trial Workspace นี้แล้ว · Formula BR-${String(updated.formulaVersion).padStart(3,'0')}`,'ok');
  }else setStatus(`โหลดตัวอย่าง “${preset.name}” เข้าหน้าทดลองแล้ว (ยังไม่บันทึกจนกว่าจะกดบันทึกสูตร)`,'');
}
function savePresetAsNewVersion(merged){
  const current=readRules();const changed=policySignature(merged)!==policySignature(current);
  const next={...current,...merged};
  if(changed){next.history=[...(current.history||[]),{version:current.formulaVersion||1,savedAt:current.updatedAt||new Date().toISOString(),pricingMethod:current.pricingMethod,rate:current.rate,commissionMethod:current.commissionMethod,commissionRate:current.commissionRate}].slice(-MAX_HISTORY);next.formulaVersion=(current.formulaVersion||1)+1;}
  return writeRules(next);
}
function seedMasterData(preset){
  try{
    const merge=(key,incoming,kind)=>{let rows=[];try{rows=JSON.parse(localStorage.getItem(tenantKey(key))||'[]')}catch(_){rows=[]}const map=new Map(rows.map(r=>[kind==='product'?String(r.code||r.name).toLowerCase():String(r.id||r.name).toLowerCase(),r]));incoming.forEach(r=>{const k=kind==='product'?String(r.code||r.name).toLowerCase():String(r.id||r.name).toLowerCase();map.set(k,{...(map.get(k)||{}),...r,updatedAt:new Date().toISOString()});});localStorage.setItem(tenantKey(key),JSON.stringify([...map.values()]));};
    merge(CONTACT_KEY,preset.contacts,'contact');merge(PRODUCT_KEY,preset.products,'product');
    window.renderMasterData?.();populateMasterOptions();
    const productList=document.getElementById('product-master-list');if(productList){productList.innerHTML=(window.productMasterRows?.()||[]).map(r=>`<option value="${esc(r.name||'')}" label="${esc((r.code||'')+' · '+(r.category||''))}"></option>`).join('')}
    const customerList=document.getElementById('customer-master-list');if(customerList){customerList.innerHTML=(window.contactMasterRows?.()||[]).filter(r=>['customer','both'].includes(r.role)).map(r=>`<option value="${esc(r.name||'')}"></option>`).join('')}
    if(window.FirebaseService?.configured&&window.FirebaseService?.saveMasterSnapshot){
      let contacts=[],products=[];try{contacts=JSON.parse(localStorage.getItem(tenantKey(CONTACT_KEY))||'[]');products=JSON.parse(localStorage.getItem(tenantKey(PRODUCT_KEY))||'[]')}catch(_){}
      window.FirebaseService.saveMasterSnapshot({contacts,products}).catch(()=>{});
    }
  }catch(err){setStatus('เพิ่มข้อมูลตัวอย่าง Master Data ไม่สำเร็จ: '+(err?.message||err),'error');}
}
function value(id){return document.getElementById(id)?.value??''}function checked(id){return Boolean(document.getElementById(id)?.checked)}
function setValue(id,v){const el=document.getElementById(id);if(el)el.value=v??''}function setChecked(id,v){const el=document.getElementById(id);if(el)el.checked=Boolean(v)}
function setPolicyForm(p){setValue('br-pricing-method',p.pricingMethod);setValue('br-rate',p.rate);setValue('br-default-discount',p.defaultCustomerDiscount);setValue('br-commission-method',p.commissionMethod);setValue('br-commission-rate',p.commissionRate);setChecked('br-cost-shipping',p.costComponents?.shipping);setChecked('br-cost-labor',p.costComponents?.labor);setChecked('br-cost-design',p.costComponents?.design);setChecked('br-cost-other',p.costComponents?.other)}
function setLab(l){setValue('br-lab-base',l.baseCost);setValue('br-lab-shipping',l.shipping);setValue('br-lab-labor',l.labor);setValue('br-lab-design',l.design);setValue('br-lab-other',l.other);setValue('br-lab-discount',l.discount);setValue('br-lab-qty',l.qty);setValue('br-lab-product',l.product||'');setValue('br-lab-customer',l.customer||'')}
function methodLabel(v){return{markup_on_cost:'Markup on Cost',target_margin:'Target Gross Margin',fixed_price:'Fixed Price'}[v]||v}
function commissionLabel(v){return{none:'ไม่มีค่าคอมมิชชัน',net_sales:'% จากยอดขายสุทธิ',gross_profit:'% จากกำไรขั้นต้น'}[v]||v}

function resolveRule({productCode='',productName='',category='',customer='',documentOverride=null,policyOverride=null}={}){
  const p=policyOverride||readRules();let method=p.pricingMethod,rate=pricingRate(p.pricingMethod,p.rate),source='Company Default';
  const key=String(productCode||productName).trim().toLowerCase();
  const exact=(p.productRules||[]).find(r=>String(r.key||'').trim().toLowerCase()===key||String(r.label||'').toLowerCase().includes(key));
  if(exact){method=exact.pricingMethod||method;rate=pricingRate(method,exact.rate);source='Product Override';}
  let discount=n(p.defaultCustomerDiscount),discountSource='Company Default';
  const cust=(p.customerRules||[]).find(r=>String(r.key||'').trim().toLowerCase()===String(customer||'').trim().toLowerCase());
  if(cust){discount=n(cust.discountPercent);discountSource='Customer Override';}
  if(documentOverride?.pricingMethod){method=documentOverride.pricingMethod;source='Document Override'}
  if(Number.isFinite(Number(documentOverride?.rate))){rate=pricingRate(method,documentOverride.rate);source='Document Override'}
  if(Number.isFinite(Number(documentOverride?.discountPercent))){discount=n(documentOverride.discountPercent);discountSource='Document Override'}
  return{policy:p,pricingMethod:method,rate,discountPercent:clamp(discount,0,100),source,discountSource,productCode,productName,category,customer};
}
function calculate(input={},resolvedRule=null){
  const rule=resolvedRule||resolveRule(input);const p=rule.policy||readRules();const comp=p.costComponents||{};
  const base=Math.max(0,n(input.baseCost));const shipping=comp.shipping?Math.max(0,n(input.shipping)):0;const labor=comp.labor?Math.max(0,n(input.labor)):0;const design=comp.design?Math.max(0,n(input.design)):0;const other=comp.other?Math.max(0,n(input.other)):0;const qty=Math.max(.0001,n(input.qty)||1);
  const directUnit=base+shipping+labor+design+other;let listUnit=directUnit;
  if(rule.pricingMethod==='target_margin'){const r=clamp(rule.rate,0,95)/100;listUnit=r>=.95?directUnit:directUnit/(1-r)}
  else if(rule.pricingMethod==='fixed_price'){listUnit=Math.max(0,n(input.fixedPrice)||n(rule.rate));}
  else listUnit=directUnit*(1+clamp(rule.rate,0,500)/100);
  const discount=Number.isFinite(Number(input.discountPercent))?clamp(input.discountPercent,0,100):rule.discountPercent;
  const netUnit=listUnit*(1-discount/100);const netSales=netUnit*qty;const directTotal=directUnit*qty;const grossProfit=netSales-directTotal;const grossMargin=netSales>0?grossProfit/netSales*100:0;
  let commission=0;if(p.commissionMethod==='net_sales')commission=netSales*clamp(p.commissionRate,0,100)/100;else if(p.commissionMethod==='gross_profit')commission=Math.max(0,grossProfit)*clamp(p.commissionRate,0,100)/100;
  const estimatedNetProfit=grossProfit-commission;const vatEnabled=input.vatEnabled!==false;const vat=vatEnabled?netSales*.07:0;const grandTotal=netSales+vat;
  return{directUnit,listUnit,netUnit,qty,netSales,directTotal,grossProfit,grossMargin,commission,estimatedNetProfit,vat,grandTotal,discount,rule};
}
function labInput(){return{baseCost:n(value('br-lab-base')),shipping:n(value('br-lab-shipping')),labor:n(value('br-lab-labor')),design:n(value('br-lab-design')),other:n(value('br-lab-other')),discountPercent:n(value('br-lab-discount')),qty:n(value('br-lab-qty'))||1,vatEnabled:value('br-lab-vat')!=='0',productCode:value('br-lab-product'),customer:value('br-lab-customer')}}
function policyFromForm(){const base=draftPolicy||readRules(),method=value('br-pricing-method')||base.pricingMethod;return{...base,pricingMethod:method,rate:pricingRate(method,value('br-rate')),defaultCustomerDiscount:clamp(value('br-default-discount'),0,100),commissionMethod:value('br-commission-method')||base.commissionMethod,commissionRate:clamp(value('br-commission-rate'),0,100),costComponents:{shipping:checked('br-cost-shipping'),labor:checked('br-cost-labor'),design:checked('br-cost-design'),other:checked('br-cost-other')}}}
function calculateLab(){
  const input=labInput();const previewPolicy=policyFromForm();const rule=resolveRule({productCode:input.productCode,customer:input.customer,policyOverride:previewPolicy});const r=calculate(input,rule);
  const set=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text};
  set('br-res-cost',money.format(r.directUnit));set('br-res-list',money.format(r.listUnit));set('br-res-net',money.format(r.netUnit));set('br-res-total',money.format(r.grandTotal));set('br-res-profit',money.format(r.grossProfit));set('br-res-margin',`${num.format(r.grossMargin)}%`);set('br-res-commission',money.format(r.commission));set('br-res-netprofit',money.format(r.estimatedNetProfit));
  set('br-res-rule',`${methodLabel(rule.pricingMethod)} ${num.format(rule.rate)}% · ${rule.source}`);set('br-res-discount',`${num.format(r.discount)}% · ${rule.discountSource}`);
  return r;
}
function renderPresets(){const wrap=document.getElementById('br-preset-grid');if(!wrap)return;wrap.innerHTML=Object.entries(PRESETS).map(([key,p])=>`<button type="button" class="brules-preset" data-br-preset="${esc(key)}"><b>${esc(p.name)}</b><small>${esc(p.description)}</small><span>${esc(p.tag)}</span></button>`).join('');wrap.querySelectorAll('[data-br-preset]').forEach(btn=>btn.addEventListener('click',()=>loadPreset(btn.dataset.brPreset)));}
function populateMasterOptions(){
  const prod=document.getElementById('br-product-list'),cust=document.getElementById('br-customer-list');if(prod){const rows=window.productMasterRows?.()||[];prod.innerHTML=rows.map(r=>`<option value="${esc(r.code||r.name)}">${esc((r.code||'')+' · '+(r.name||''))}</option>`).join('')}if(cust){const rows=(window.contactMasterRows?.()||[]).filter(r=>['customer','both'].includes(r.role));cust.innerHTML=rows.map(r=>`<option value="${esc(r.name)}"></option>`).join('')}
}
function renderRulesTables(policy=readRules()){
  const pr=document.getElementById('br-product-rules-table'),cr=document.getElementById('br-customer-rules-table');
  if(pr)pr.innerHTML=(policy.productRules||[]).length?`<div class="brules-table-wrap"><table class="brules-table"><thead><tr><th>สินค้า</th><th>วิธีคำนวณ</th><th>อัตรา</th><th></th></tr></thead><tbody>${policy.productRules.map((r,i)=>`<tr><td>${esc(r.label||r.key)}</td><td><span class="brules-pill purple">${esc(methodLabel(r.pricingMethod))}</span></td><td>${num.format(r.rate)}%</td><td><button class="brules-delete" data-del-product="${i}">ลบ</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="brules-note">ยังไม่มี Product Override — ระบบใช้สูตรบริษัทเป็นค่าเริ่มต้น</div>';
  if(cr)cr.innerHTML=(policy.customerRules||[]).length?`<div class="brules-table-wrap"><table class="brules-table"><thead><tr><th>ลูกค้า</th><th>ส่วนลด</th><th></th></tr></thead><tbody>${policy.customerRules.map((r,i)=>`<tr><td>${esc(r.label||r.key)}</td><td>${num.format(r.discountPercent)}%</td><td><button class="brules-delete" data-del-customer="${i}">ลบ</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="brules-note">ยังไม่มี Customer Override — ระบบใช้ส่วนลด Default ของบริษัท</div>';
  pr?.querySelectorAll('[data-del-product]').forEach(b=>b.addEventListener('click',()=>commitRuleChange(p=>p.productRules.splice(Number(b.dataset.delProduct),1),'ลบ Product Override แล้ว')));cr?.querySelectorAll('[data-del-customer]').forEach(b=>b.addEventListener('click',()=>commitRuleChange(p=>p.customerRules.splice(Number(b.dataset.delCustomer),1),'ลบ Customer Override แล้ว')));
}
function commitRuleChange(mutator,message){const current=readRules();const next=JSON.parse(JSON.stringify(current));mutator(next);if(policySignature(next)!==policySignature(current)){next.history=[...(current.history||[]),{version:current.formulaVersion||1,savedAt:current.updatedAt||new Date().toISOString(),pricingMethod:current.pricingMethod,rate:current.rate,commissionMethod:current.commissionMethod,commissionRate:current.commissionRate}].slice(-MAX_HISTORY);next.formulaVersion=(current.formulaVersion||1)+1;}draftPolicy=null;writeRules(next);renderAll();setStatus(message+` · BR-${String(next.formulaVersion||1).padStart(3,'0')}`,'ok');return next}
function addProductRule(){const key=value('br-rule-product').trim();if(!key)return setStatus('กรุณาเลือกรหัส/ชื่อสินค้าที่ต้องการ Override','warn');const row={key,label:key,pricingMethod:value('br-rule-product-method'),rate:pricingRate(value('br-rule-product-method'),value('br-rule-product-rate'))};commitRuleChange(p=>{const idx=(p.productRules||[]).findIndex(x=>String(x.key).toLowerCase()===key.toLowerCase());if(idx>=0)p.productRules[idx]=row;else(p.productRules||(p.productRules=[])).push(row)},'บันทึก Product Override แล้ว')}
function addCustomerRule(){const key=value('br-rule-customer').trim();if(!key)return setStatus('กรุณาเลือกลูกค้าที่ต้องการกำหนดส่วนลด','warn');const row={key,label:key,discountPercent:clamp(value('br-rule-customer-discount'),0,100)};commitRuleChange(p=>{const idx=(p.customerRules||[]).findIndex(x=>String(x.key).toLowerCase()===key.toLowerCase());if(idx>=0)p.customerRules[idx]=row;else(p.customerRules||(p.customerRules=[])).push(row)},'บันทึก Customer Override แล้ว')}
function renderVersion(policy=readRules()){
  const badge=document.getElementById('br-version-badge');if(badge)badge.textContent=`Formula BR-${String(policy.formulaVersion||1).padStart(3,'0')}`;
  const audit=document.getElementById('br-audit');if(audit)audit.innerHTML=`<div><small>Tenant</small><b>${esc(tenantId())}</b></div><div><small>สูตรหลัก</small><b>${esc(methodLabel(policy.pricingMethod))} ${num.format(policy.rate)}%</b></div><div><small>Commission</small><b>${esc(commissionLabel(policy.commissionMethod))} ${num.format(policy.commissionRate)}%</b></div><div><small>แก้ไขล่าสุด</small><b>${esc(new Date(policy.updatedAt||Date.now()).toLocaleString('th-TH'))}</b></div>`;
  const hist=document.getElementById('br-version-history');if(hist){const rows=[...(policy.history||[]),{version:policy.formulaVersion,savedAt:policy.updatedAt,pricingMethod:policy.pricingMethod,rate:policy.rate,commissionMethod:policy.commissionMethod,commissionRate:policy.commissionRate,current:true}].slice(-8).reverse();hist.innerHTML=`<div class="brules-table-wrap"><table class="brules-table"><thead><tr><th>Version</th><th>สูตร</th><th>Commission</th><th>บันทึกเมื่อ</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="brules-pill ${r.current?'green':''}">BR-${String(r.version||1).padStart(3,'0')}${r.current?' · Current':''}</span></td><td>${esc(methodLabel(r.pricingMethod))} ${num.format(r.rate)}%</td><td>${esc(commissionLabel(r.commissionMethod))} ${num.format(r.commissionRate)}%</td><td>${esc(r.savedAt?new Date(r.savedAt).toLocaleString('th-TH'):'-')}</td></tr>`).join('')}</tbody></table></div>`;}
}
function renderAll(){const p=readRules();setPolicyForm(p);renderRulesTables(p);renderVersion(p);populateMasterOptions();calculateLab()}
function setStatus(text,type=''){const el=document.getElementById('br-status');if(!el)return;el.textContent=text||'';el.className='brules-status'+(type?' '+type:'')}

function snapshotForItem({productCode='',productName='',category='',customer='',actualUnitPrice=0}={}){
  const rule=resolveRule({productCode,productName,category,customer});const product=window.productMasterMeta?.(productName,productCode,category)||{};const calc=calculate({baseCost:n(product.standardCost),qty:1,discountPercent:rule.discountPercent,vatEnabled:false},rule);
  return{formulaVersion:rule.policy.formulaVersion||1,formulaCode:`BR-${String(rule.policy.formulaVersion||1).padStart(3,'0')}`,pricingMethod:rule.pricingMethod,rate:rule.rate,ruleSource:rule.source,discountPercent:rule.discountPercent,discountSource:rule.discountSource,standardCost:n(product.standardCost),suggestedUnitPrice:Math.round(calc.netUnit*100)/100,actualUnitPrice:n(actualUnitPrice),capturedAt:new Date().toISOString()};
}
function suggestQuoteUnitPrice({productCode='',productName='',category='',customer=''}={}){const snap=snapshotForItem({productCode,productName,category,customer});return snap.standardCost>0?snap:null}
function applyLabPriceToQuote(){const r=calculateLab();const row=document.querySelector('#q-items-body tr');if(!row)return setStatus('ยังไม่มีแถวสินค้าในใบเสนอราคา','warn');const nums=row.querySelectorAll('input[type=number]');if(nums[1]){nums[1].value=(Math.round(r.netUnit*100)/100).toFixed(2);window.calcQ?.();setStatus('นำราคาขายสุทธิจาก Formula Lab ไปใส่แถวแรกของใบเสนอราคาแล้ว','ok')}}

async function hydrateCloud(){if(!window.FirebaseService?.configured||!window.FirebaseService?.loadBusinessRules)return;try{const cloud=await window.FirebaseService.loadBusinessRules();if(cloud&&Object.keys(cloud).length){writeRules({...cloud,history:Array.isArray(cloud.history)?cloud.history:[]},{skipCloud:true});renderAll();setStatus('โหลด Business Rules ของบริษัทจาก Firebase แล้ว','ok')}}catch(err){console.warn('load business rules failed',err)}}

function bind(){
  renderPresets();renderAll();
  ['br-pricing-method','br-rate','br-default-discount','br-commission-method','br-commission-rate','br-cost-shipping','br-cost-labor','br-cost-design','br-cost-other'].forEach(id=>document.getElementById(id)?.addEventListener('change',calculateLab));
  ['br-lab-base','br-lab-shipping','br-lab-labor','br-lab-design','br-lab-other','br-lab-discount','br-lab-qty','br-lab-product','br-lab-customer','br-lab-vat'].forEach(id=>document.getElementById(id)?.addEventListener('input',calculateLab));
  document.getElementById('br-save')?.addEventListener('click',saveFromForm);
  document.getElementById('br-add-product-rule')?.addEventListener('click',addProductRule);document.getElementById('br-add-customer-rule')?.addEventListener('click',addCustomerRule);document.getElementById('br-apply-quote')?.addEventListener('click',applyLabPriceToQuote);
  document.getElementById('br-seed-selected')?.addEventListener('click',()=>{const active=document.querySelector('[data-br-preset].active')?.dataset.brPreset||'made_to_order';loadPreset(active,{seed:true})});
  window.addEventListener('comform-auth-ready',()=>setTimeout(()=>{renderAll();hydrateCloud()},250));
  setTimeout(hydrateCloud,800);
}

window.BusinessRulesService={read:readRules,save:writeRules,resolveRule,calculate,snapshotForItem,suggestQuoteUnitPrice,currentVersion:()=>readRules().formulaVersion||1,render:()=>{draftPolicy=null;renderAll()},loadPreset};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
