// Trial Mode + Onboarding Wizard
let trialState = null;
let wrapped = false;

async function token(){
  const user=window.ComformAuth?.auth?.currentUser;
  if(!user) throw new Error('not-authenticated');
  return user.getIdToken();
}
async function api(path){
  const t=await token();
  const r=await fetch(path,{headers:{Authorization:`Bearer ${t}`}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}
function tenantKey(name){
  const tid=window.CurrentUser?.tenantId||'unknown';
  return `trial::${tid}::${name}`;
}
function pdfDone(){return localStorage.getItem(tenantKey('quote-pdf-viewed'))==='1';}
function markPdfDone(){localStorage.setItem(tenantKey('quote-pdf-viewed'),'1');renderTrialUi();}
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function fmtDate(ms){if(!ms)return'-';return new Intl.DateTimeFormat('th-TH',{dateStyle:'medium'}).format(new Date(ms));}

async function loadTrial({force=false}={}){
  if(trialState && !force)return trialState;
  if(window.CurrentUser?.localDemo){trialState={enabled:false};return trialState;}
  const data=await api('/api/trial-status');
  trialState=data.trial||{enabled:false};
  // Local-first ERP may persist before the cloud snapshot is refreshed. Use the
  // larger of local/cloud counts so onboarding and Trial limits react instantly.
  try{
    const contacts=window.contactMasterRows?.()||[];
    const customers=contacts.filter(r=>r?.role==='customer'||r?.role==='both').length;
    const suppliers=contacts.filter(r=>r?.role==='supplier'||r?.role==='both').length;
    const products=(window.productMasterRows?.()||[]).filter(r=>!r?.isSeed).length;
    const years=window.allYears?.()||[];
    const docCount=(type)=>years.reduce((sum,y)=>sum+(window.docsForYear?.(type,Number(y),null)?.length||0),0);
    trialState.counts={...(trialState.counts||{}),customers:Math.max(customers,Number(trialState.counts?.customers||0)),suppliers:Math.max(suppliers,Number(trialState.counts?.suppliers||0)),products:Math.max(products,Number(trialState.counts?.products||0)),quotes:Math.max(docCount('quotes'),Number(trialState.counts?.quotes||0)),invoices:Math.max(docCount('invoices'),Number(trialState.counts?.invoices||0)),receipts:Math.max(docCount('receipts'),Number(trialState.counts?.receipts||0))};
    trialState.onboarding={...(trialState.onboarding||{}),customer:trialState.counts.customers>0,product:trialState.counts.products>0,quote:trialState.counts.quotes>0};
  }catch(_){/* cloud counts remain authoritative fallback */}
  renderTrialUi();
  return trialState;
}

function removeUi(){document.getElementById('trial-banner')?.remove();document.getElementById('trial-onboarding')?.remove();document.getElementById('trial-readonly-overlay')?.remove();}
function stepHtml(done,title,sub,action,label){return `<div class="trial-step ${done?'done':''}"><span class="trial-step-dot">${done?'✓':'○'}</span><div><b>${esc(title)}</b><small>${esc(sub)}</small></div><button type="button" onclick="window.TrialService.action('${action}')">${esc(label)}</button></div>`;}
function usageCard(label,key){const c=Number(trialState?.counts?.[key]||0),l=Number(trialState?.limits?.[key]||0);return `<div class="trial-usage-card"><b>${c} / ${l||'∞'}</b><span>${esc(label)}</span></div>`;}

function renderTrialUi(){
  if(!trialState?.enabled){removeUi();return;}
  const top=document.querySelector('.comform-topbar');
  let banner=document.getElementById('trial-banner');
  if(!banner){banner=document.createElement('div');banner.id='trial-banner';banner.className='trial-banner';top?.insertAdjacentElement('afterend',banner);}
  const expired=Boolean(trialState.expired);
  banner.innerHTML=`<div><strong>${expired?'⛔ Trial หมดอายุแล้ว':'🧪 โหมดทดลองใช้งาน'}</strong><small>${expired?'ระบบอยู่ในโหมดอ่านอย่างเดียว กรุณาติดต่อผู้ให้บริการเพื่อเปิดแพ็กเกจ':'เหลือเวลาทดลอง '+(trialState.remainingDays??'-')+' วัน · หมดอายุ '+fmtDate(trialState.expiresAt)}</small></div><div class="trial-banner-actions"><span class="trial-pill ${expired?'expired':''}">${expired?'Read only':'Trial'}</span><button class="btn btn-sm btn-primary" type="button" onclick="window.TrialService.toggleOnboarding(false)">คู่มือเริ่มต้น</button></div>`;

  const steps=[
    {done:trialState.onboarding?.company,title:'1. ตรวจข้อมูลบริษัท',sub:'ชื่อบริษัท ที่อยู่ เลขผู้เสียภาษี หรือโทรศัพท์',action:'company',label:'ตรวจสอบ'},
    {done:trialState.onboarding?.customer,title:'2. เพิ่มลูกค้า 1 ราย',sub:`ตอนนี้ ${trialState.counts?.customers||0} ราย`,action:'customer',label:'เพิ่มลูกค้า'},
    {done:trialState.onboarding?.product,title:'3. เพิ่มสินค้า 1 รายการ',sub:`ตอนนี้ ${trialState.counts?.products||0} รายการ`,action:'product',label:'เพิ่มสินค้า'},
    {done:trialState.onboarding?.quote,title:'4. สร้างใบเสนอราคา',sub:`ตอนนี้ ${trialState.counts?.quotes||0} ใบ`,action:'quote',label:'สร้างเอกสาร'},
    {done:pdfDone(),title:'5. ดูตัวอย่าง/PDF',sub:'เปิด Preview ใบเสนอราคาอย่างน้อย 1 ครั้ง',action:'quote',label:'ไปใบเสนอราคา'}
  ];
  const done=steps.filter(x=>x.done).length;
  let box=document.getElementById('trial-onboarding');
  if(!box){box=document.createElement('aside');box.id='trial-onboarding';box.className='trial-onboarding';document.body.appendChild(box);}
  const collapsed=localStorage.getItem(tenantKey('onboarding-collapsed'))==='1';box.classList.toggle('collapsed',collapsed);
  box.innerHTML=`<div class="trial-onboarding-head"><div><h3>เริ่มทดลอง ERP ใน 5 ขั้นตอน</h3><p>แนะนำให้ทดลองจากข้อมูลหลัก → ใบเสนอราคา → PDF ก่อน แล้วค่อยดู Stock และ Analytics</p></div><button class="trial-collapse" onclick="window.TrialService.toggleOnboarding()">${collapsed?'＋':'−'}</button></div><div class="trial-onboarding-body"><div class="trial-progress-row"><span>ความคืบหน้า</span><b>${done} / ${steps.length}</b></div><div class="trial-progress"><span style="width:${done/steps.length*100}%"></span></div>${steps.map(s=>stepHtml(s.done,s.title,s.sub,s.action,s.label)).join('')}<div class="trial-usage">${usageCard('ลูกค้า','customers')}${usageCard('สินค้า','products')}${usageCard('ใบเสนอราคา','quotes')}${usageCard('Invoice','invoices')}${usageCard('ใบเสร็จ','receipts')}</div>${expired?'<div class="trial-limit-warning">Trial หมดอายุแล้ว: Firestore Rules จะไม่อนุญาตการเขียนข้อมูลใหม่ แต่ยังอ่าน/Export ข้อมูลเดิมได้</div>':''}</div>`;
}

function action(name){
  if(name==='company'){window.go?.('saas-admin');window.SaaSService?.renderPanel?.();return;}
  if(name==='customer'){window.go?.('master-data');setTimeout(()=>window.switchMasterTab?.('customer',document.querySelector('[data-master-tab="customer"]')),80);return;}
  if(name==='product'){window.go?.('master-data');setTimeout(()=>window.switchMasterTab?.('product',document.querySelector('[data-master-tab="product"]')),80);return;}
  if(name==='quote'){window.go?.('quote-form');return;}
}
function toggleOnboarding(force){const box=document.getElementById('trial-onboarding');if(!box)return;const next=typeof force==='boolean'?force:!box.classList.contains('collapsed');localStorage.setItem(tenantKey('onboarding-collapsed'),next?'1':'0');renderTrialUi();}

function limitMessage(type){const label={customers:'ลูกค้า',suppliers:'ผู้จำหน่าย',products:'สินค้า',quotes:'ใบเสนอราคา',invoices:'ใบส่งสินค้า/ใบกำกับภาษี',receipts:'ใบเสร็จ'}[type]||type;return `Trial ใช้ ${label} ครบจำนวนที่กำหนดแล้ว (${trialState.counts?.[type]||0}/${trialState.limits?.[type]||0}) กรุณาติดต่อผู้ให้บริการเพื่อเปิดแพ็กเกจจริง`;}
function canCreate(type){
  if(!trialState?.enabled)return true;
  if(trialState.expired){window.notify?.('Trial หมดอายุแล้ว ระบบอยู่ในโหมดอ่านอย่างเดียว','error');return false;}
  const limit=Number(trialState.limits?.[type]||0),count=Number(trialState.counts?.[type]||0);
  if(limit>0&&count>=limit){window.notify?.(limitMessage(type),'error');return false;}
  return true;
}
function wrap(name,type,{markPdf=false}={}){
  const original=window[name];if(typeof original!=='function'||original.__trialWrapped)return;
  const fn=async function(...args){
    if(markPdf){markPdfDone();return original.apply(this,args);}
    if(!canCreate(type))return;
    const result=await original.apply(this,args);
    setTimeout(()=>loadTrial({force:true}).catch(()=>{}),700);
    return result;
  };
  fn.__trialWrapped=true;window[name]=fn;
}
function installGuards(){
  if(wrapped)return;wrapped=true;
  wrap('saveCustomerMaster','customers');wrap('saveSupplierMaster','suppliers');wrap('saveProductMasterLocal','products');
  wrap('saveQuote','quotes');wrap('saveInvoice','invoices');wrap('saveReceipt','receipts');
  wrap('previewQuoteDocumentFromForm','quotes',{markPdf:true});
}

async function boot(){
  try{await loadTrial({force:true});installGuards();}
  catch(e){console.warn('[TrialMode] unavailable',e);}
}
window.TrialService={loadTrial,renderTrialUi,action,toggleOnboarding,canCreate,markPdfDone};
window.addEventListener('comform-auth-ready',()=>setTimeout(boot,250));
setTimeout(()=>{if(window.CurrentUser)boot();},1600);
