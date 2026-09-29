const KEYS={
  purchaseOrders:'comform_purchase_orders_v1',
  goodsReceipts:'comform_goods_receipts_v1',
  inventoryMovements:'comform_inventory_movements_v1',
  audit:'comform_audit_log_v1',
  trash:'comform_recycle_bin_v1'
};
const BRANCH_LABEL={ubon:'สาขาสำนักงานใหญ่',khonkaen:'สาขาที่ 00001'};
const ENTITY_LABEL={quote:'ใบเสนอราคา',quotes:'ใบเสนอราคา',production:'ใบสั่งผลิต',productions:'ใบสั่งผลิต',invoice:'ใบส่งสินค้า / ใบกำกับภาษี',invoices:'ใบส่งสินค้า / ใบกำกับภาษี',receipt:'ใบเสร็จรับเงิน',receipts:'ใบเสร็จรับเงิน',expense:'ค่าใช้จ่าย',expenses:'ค่าใช้จ่าย',purchase_order:'ใบสั่งซื้อ',goods_receipt:'ใบรับสินค้า',inventory:'คลังสินค้า',product:'สินค้า',customer:'ลูกค้า',supplier:'ผู้จำหน่าย'};

const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const num=v=>Number(String(v??'').replace(/,/g,''))||0;
const money=v=>new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
const qtyFmt=v=>new Intl.NumberFormat('th-TH',{maximumFractionDigits:2}).format(num(v));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const nowIso=()=>new Date().toISOString();
function scopedKey(key){return window.ComformTenant?.storageKey?.(key)||String(key||'');}
function read(key){try{const x=JSON.parse(localStorage.getItem(scopedKey(key))||'[]');return Array.isArray(x)?x:[];}catch{return[];}}
function write(key,rows){localStorage.setItem(scopedKey(key),JSON.stringify(rows||[]));}
function cloudSave(collectionName,row){
  if(!window.FirebaseService?.configured||typeof window.FirebaseService.saveOperationalRecord!=='function')return;
  window.FirebaseService.saveOperationalRecord(collectionName,row).catch(err=>console.warn(`[Operational Sync] ${collectionName} save failed`,err));
}
function stamp(row={}){
  if(row.updatedAtIso)return Date.parse(row.updatedAtIso)||0;
  if(row.updatedAt?.seconds)return Number(row.updatedAt.seconds)*1000;
  return Date.parse(row.updatedAt||row.createdAt||row.createdAtIso||row.date||0)||0;
}
function mergeCloudRows(localRows=[],cloudRows=[]){
  const map=new Map();
  [...localRows,...cloudRows].forEach(row=>{if(!row)return;const key=String(row.id||row.firebaseId||row.no||'');if(!key)return;const cur=map.get(key);if(!cur||stamp(row)>=stamp(cur))map.set(key,{...cur,...row,id:row.id||cur?.id||row.firebaseId});});
  return [...map.values()];
}
async function syncOperationalFromCloud(){
  if(!window.FirebaseService?.configured||typeof window.FirebaseService.loadOperationalRecords!=='function')return false;
  const specs=[['purchaseOrders',KEYS.purchaseOrders],['goodsReceipts',KEYS.goodsReceipts],['inventoryMovements',KEYS.inventoryMovements],['auditLogs',KEYS.audit]];
  try{
    const results=await Promise.all(specs.map(([name])=>window.FirebaseService.loadOperationalRecords(name).catch(err=>{console.warn(`[Operational Sync] ${name} load failed`,err);return null;})));
    results.forEach((cloud,i)=>{if(!Array.isArray(cloud))return;const [,key]=specs[i];const merged=mergeCloudRows(read(key),cloud);write(key,merged);});
    renderPoList();renderGoodsReceipts();renderInventory();renderAudit();renderOpsDashboard();window.renderMasterData?.();return true;
  }catch(err){console.warn('[Operational Sync] failed',err);return false;}
}
function id(prefix){return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;}
function normalize(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ');}
function branchFromForm(prefix){
  const ub=document.getElementById(prefix+'-br-ub'),kk=document.getElementById(prefix+'-br-kk');
  if(ub?.classList.contains('ub-sel'))return'ubon';
  if(kk?.classList.contains('kk-sel'))return'khonkaen';
  return'';
}
function currentProfile(){return window.ComformAuth?.getCurrentProfile?.()||window.CurrentUser||null;}
function lockedBranch(){const b=currentProfile()?.branch;return b&&b!=='all'?b:'';}
function branchActive(branch){return window.SaaSService?.isBranchActive?.(branch) ?? true;}
function canSeeBranch(branch){const locked=lockedBranch();return branchActive(branch)&&(!locked||branch===locked);}
function enforceOperationalBranchUi(){
  const locked=lockedBranch();
  ['po-branch','gr-branch','adj-branch'].forEach(id=>{const el=document.getElementById(id);if(!el)return;if(locked)el.value=locked;el.disabled=!!locked;});
  const inv=document.getElementById('inv-branch-filter');if(inv){if(locked)inv.value=locked;inv.disabled=!!locked;}
  const tf=document.getElementById('transfer-from'),tt=document.getElementById('transfer-to');if(tf){if(locked)tf.value=locked;tf.disabled=!!locked;}if(tt&&locked){tt.value=locked==='ubon'?'khonkaen':'ubon';}
}
function userLabel(){
  const el=document.querySelector('[data-user-email],#auth-user-email,.auth-user-email');
  return el?.dataset?.userEmail||el?.textContent?.trim()||'Local user';
}
function audit(action,entity,ref='',detail='',meta={}){
  const rows=read(KEYS.audit);
  const row={id:id('audit'),at:nowIso(),action,entity,ref:String(ref||''),detail:String(detail||''),branch:meta.branch||'',user:meta.user||userLabel(),meta,createdAt:nowIso(),updatedAtIso:nowIso()};
  rows.unshift(row);
  write(KEYS.audit,rows.slice(0,2500));cloudSave('auditLogs',row);
  if(document.getElementById('panel-audit-log')?.classList.contains('active'))renderAudit();
}
function trashSnapshot(type,record,branch,year,month){
  if(!record)return;
  const rows=read(KEYS.trash);
  rows.unshift({id:id('trash'),deletedAt:nowIso(),type,branch,year:Number(year),month:Number(month),record});
  write(KEYS.trash,rows.slice(0,300));
  audit('delete',type,record.no||record.id||'',`ย้ายสำเนาไป Recycle Bin ก่อนลบจากข้อมูลหลัก`,{branch});
}
function productRows(){return typeof window.productMasterRows==='function'?window.productMasterRows():[];}
function productBy(value,code=''){
  const rows=productRows(),n=normalize(value),c=normalize(code);
  return rows.find(r=>(c&&normalize(r.code)===c)||normalize(r.name)===n||normalize(r.code)===n)||null;
}
function supplierBy(name){return typeof window.findContactMaster==='function'?window.findContactMaster(name,'supplier'):null;}
function movementRows(){return read(KEYS.inventoryMovements).filter(r=>!r.voided);}
function productKey(product){return normalize(product?.code||product?.name||product);}
function inventoryMovementNet(product,branch=''){
  const key=productKey(product);
  return movementRows().filter(r=>(!branch||r.branch===branch)&&productKey({code:r.productCode,name:r.product})===key).reduce((s,r)=>s+num(r.qty),0);
}
function stockOnHand(product,branch=''){
  if(branch==='all'||!branch){
    return ['ubon','khonkaen'].filter(branchActive).reduce((sum,b)=>sum+stockOnHand(product,b),0);
  }
  if(!branchActive(branch))return 0;
  if(typeof window.productEstimatedStock==='function')return num(window.productEstimatedStock(product,branch));
  const base=branch==='ubon'?num(product.openingStockUbon??product.openingStock):branch==='khonkaen'?num(product.openingStockKhonkaen):0;
  return Math.max(0,base+inventoryMovementNet(product,branch));
}
function availableStock(product,branch){return stockOnHand(product,branch);}
function docNo(prefix,key,dateValue){
  const d=new Date(`${dateValue||today()}T00:00:00`);const yy=String(d.getFullYear()+543).slice(-2),mm=String(d.getMonth()+1).padStart(2,'0');
  const root=`${prefix}${yy}${mm}`;const rows=read(key);let max=0;
  rows.forEach(r=>{const m=String(r.no||'').match(new RegExp(`^${root}(\\d{2,3})$`));if(m)max=Math.max(max,Number(m[1]));});
  return root+String(max+1).padStart(2,'0');
}
function poRows(){return read(KEYS.purchaseOrders);}
function grRows(){return read(KEYS.goodsReceipts);}
function poReceivedQty(poId,itemKey){
  return grRows().filter(g=>g.poId===poId&&!g.reversed).flatMap(g=>g.items||[]).filter(i=>productKey(i)===itemKey).reduce((s,i)=>s+num(i.qty),0);
}
function poOutstanding(po,item){return Math.max(0,num(item.qty)-poReceivedQty(po.id,productKey(item)));}
function recalcPoStatus(po){
  if(po.status==='cancelled')return po.status;
  const items=po.items||[];const any=items.some(i=>poReceivedQty(po.id,productKey(i))>0);const all=items.length&&items.every(i=>poOutstanding(po,i)<=0.000001);
  return all?'received':any?'partial':(po.status==='draft'?'draft':'ordered');
}
function savePoRows(rows){write(KEYS.purchaseOrders,rows);}
function saveGrRows(rows){write(KEYS.goodsReceipts,rows);}
function saveMovementRows(rows){write(KEYS.inventoryMovements,rows);}
function statusPill(status){
  const map={draft:['gray','ร่าง'],ordered:['blue','ส่งคำสั่งซื้อแล้ว'],partial:['amber','รับบางส่วน'],received:['green','รับครบแล้ว'],cancelled:['red','ยกเลิก'],posted:['green','Post แล้ว'],reversed:['red','กลับรายการแล้ว']};const x=map[status]||['gray',status||'-'];return `<span class="badge b-${x[0]}">${esc(x[1])}</span>`;
}

function refreshPoNo(){const value=docNo('PO',KEYS.purchaseOrders,document.getElementById('po-date')?.value);const el=document.getElementById('po-no');if(el)el.value=value;return value;}
function refreshGrNo(){const value=docNo('GR',KEYS.goodsReceipts,document.getElementById('gr-date')?.value);const el=document.getElementById('gr-no');if(el)el.value=value;return value;}
function applySupplierToPo(){
  const name=document.getElementById('po-supplier')?.value||'',r=supplierBy(name);
  const addr=document.getElementById('po-supplier-address'),tax=document.getElementById('po-supplier-tax');
  if(addr)addr.value=r?.address||'';if(tax)tax.value=r?.taxId||'';
}
function addPoItem(item={}){
  const tb=document.getElementById('po-items-body');if(!tb)return;
  const tr=document.createElement('tr');
  tr.innerHTML=`<td><input data-f="product" list="product-master-list" value="${esc(item.product||'')}" placeholder="เลือกสินค้า" onchange="pcApplyPoProduct(this)"><small class="prodcore-row-note"></small></td><td><input data-f="stock" class="ro" readonly value=""></td><td><input data-f="qty" type="number" min="0" step="0.01" value="${item.qty??''}" oninput="pcCalcPo()"></td><td><input data-f="unit" value="${esc(item.unit||'ชิ้น')}"></td><td><input data-f="cost" type="number" min="0" step="0.01" value="${item.unitCost??item.cost??''}" oninput="pcCalcPo()"></td><td><input data-f="total" class="ro" readonly></td><td><button type="button" class="prodcore-row-remove" onclick="this.closest('tr').remove();pcCalcPo()">×</button></td>`;
  tb.appendChild(tr);applyPoProduct(tr.querySelector('[data-f="product"]'));calcPo();
}
function applyPoProduct(input){
  const tr=input?.closest('tr');if(!tr)return;const p=productBy(input.value);const branch=document.getElementById('po-branch')?.value||'ubon';
  if(!p){tr.dataset.productCode='';tr.querySelector('[data-f="stock"]').value='';tr.querySelector('.prodcore-row-note').textContent='ไม่พบใน Product Master';return;}
  tr.dataset.productCode=p.code||'';tr.dataset.fulfillment=p.fulfillmentType||'';tr.dataset.flowType=p.flowType||'';
  input.value=p.name||input.value;tr.querySelector('[data-f="stock"]').value=qtyFmt(stockOnHand(p,branch));tr.querySelector('[data-f="unit"]').value=p.unit||'ชิ้น';
  if(!num(tr.querySelector('[data-f="cost"]').value))tr.querySelector('[data-f="cost"]').value=p.standardCost||'';
  tr.querySelector('.prodcore-row-note').textContent=`${p.code||''} · ${p.fulfillmentType==='stock'?'สินค้าในสต็อก':p.fulfillmentType==='made_to_order'?'สั่งซื้อ/ผลิตตามงาน':'บริการ'}`;
}
function calcPo(){let total=0;document.querySelectorAll('#po-items-body tr').forEach(tr=>{const q=num(tr.querySelector('[data-f="qty"]')?.value),c=num(tr.querySelector('[data-f="cost"]')?.value),t=q*c;total+=t;const x=tr.querySelector('[data-f="total"]');if(x)x.value=money(t);});const el=document.getElementById('po-total');if(el)el.textContent=`฿${money(total)}`;return total;}
function poItems(){return [...document.querySelectorAll('#po-items-body tr')].map(tr=>{const product=tr.querySelector('[data-f="product"]')?.value.trim()||'',p=productBy(product,tr.dataset.productCode);return{productCode:p?.code||tr.dataset.productCode||'',product:p?.name||product,fulfillmentType:p?.fulfillmentType||tr.dataset.fulfillment||'',flowType:p?.flowType||tr.dataset.flowType||'',qty:num(tr.querySelector('[data-f="qty"]')?.value),unit:tr.querySelector('[data-f="unit"]')?.value||p?.unit||'ชิ้น',unitCost:num(tr.querySelector('[data-f="cost"]')?.value)};}).filter(i=>i.product&&i.qty>0);}
function resetPo(){
  ['po-supplier','po-supplier-address','po-supplier-tax','po-note','po-expected'].forEach(x=>{const e=document.getElementById(x);if(e)e.value='';});
  const d=document.getElementById('po-date');if(d)d.value=today();const s=document.getElementById('po-status');if(s)s.value='draft';const tb=document.getElementById('po-items-body');if(tb)tb.innerHTML='';refreshPoNo();addPoItem();
}
function savePo(){
  const no=document.getElementById('po-no')?.value||refreshPoNo(),date=document.getElementById('po-date')?.value,supplier=document.getElementById('po-supplier')?.value.trim(),branch=lockedBranch()||document.getElementById('po-branch')?.value||'';
  if(!date||!supplier||!branch)return window.notify?.('กรุณากรอกวันที่ สาขา และผู้จำหน่าย');const items=poItems();if(!items.length)return window.notify?.('กรุณาเพิ่มรายการสั่งซื้ออย่างน้อย 1 รายการ');
  const invalid=items.find(i=>i.fulfillmentType==='service');if(invalid)return window.notify?.(`รายการ ${invalid.product} เป็นบริการ ไม่ควรรับเข้าสต็อก`);
  if(poRows().some(p=>p.no===no))return window.notify?.(`เลขที่ PO ${no} มีอยู่แล้ว กรุณากดเลขใหม่`);
  const row={id:id('po'),no,date,branch,supplier,supplierAddress:document.getElementById('po-supplier-address')?.value||'',supplierTaxId:document.getElementById('po-supplier-tax')?.value||'',expectedDate:document.getElementById('po-expected')?.value||'',status:document.getElementById('po-status')?.value||'draft',items:items.map(i=>({...i,total:i.qty*i.unitCost})),subtotal:items.reduce((s,i)=>s+i.qty*i.unitCost,0),note:document.getElementById('po-note')?.value.trim()||'',createdAt:nowIso(),updatedAt:nowIso(),updatedAtIso:nowIso()};
  const rows=poRows();rows.unshift(row);savePoRows(rows);cloudSave('purchaseOrders',row);audit('create','purchase_order',no,`สร้าง PO ${items.length} รายการ · ${supplier} · ฿${money(row.subtotal)}`,{branch});window.notify?.('บันทึกใบสั่งซื้อเรียบร้อย');resetPo();renderPoList();populateOpenPo();
}
function renderPoList(){
  const root=document.getElementById('po-list-table');if(!root)return;const rows=poRows().filter(p=>canSeeBranch(p.branch)).map(p=>({...p,status:recalcPoStatus(p)})).sort((a,b)=>String(b.date).localeCompare(String(a.date)));document.getElementById('po-list-count').textContent=`${rows.length} ใบ`;
  if(!rows.length){root.innerHTML='<div class="empty">ยังไม่มีใบสั่งซื้อ</div>';return;}
  root.innerHTML=`<div class="tbl-wrap"><table class="prodcore-table"><thead><tr><th>PO</th><th>วันที่</th><th>สาขา</th><th>ผู้จำหน่าย</th><th>กำหนดรับ</th><th>มูลค่า</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${rows.map(p=>`<tr><td><b>${esc(p.no)}</b></td><td>${esc(p.date)}</td><td>${esc(BRANCH_LABEL[p.branch]||p.branch)}</td><td>${esc(p.supplier)}</td><td>${esc(p.expectedDate||'-')}</td><td class="tn">฿${money(p.subtotal)}</td><td>${statusPill(p.status)}</td><td><div class="prodcore-actions">${!['received','cancelled'].includes(p.status)?`<button class="btn btn-green btn-sm" onclick="pcUsePoForReceipt('${p.id}')">รับสินค้า</button>`:''}${['draft','ordered'].includes(p.status)?`<button class="btn btn-danger btn-sm" onclick="pcCancelPo('${p.id}')">ยกเลิก</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`;
}
function cancelPo(idv){const rows=poRows(),p=rows.find(x=>x.id===idv);if(!p)return;if(grRows().some(g=>g.poId===p.id&&!g.reversed))return window.notify?.('PO นี้มีรายการรับสินค้าแล้ว ไม่สามารถยกเลิกตรง ๆ ได้ กรุณากลับรายการใบรับสินค้าก่อน');if(!confirm(`ยกเลิก ${p.no} ใช่หรือไม่?`))return;p.status='cancelled';p.updatedAt=nowIso();p.updatedAtIso=nowIso();savePoRows(rows);cloudSave('purchaseOrders',p);audit('update','purchase_order',p.no,'ยกเลิกใบสั่งซื้อ',{branch:p.branch});renderPoList();populateOpenPo();}
function usePoForReceipt(idv){const p=poRows().find(x=>x.id===idv);if(!p)return;window.go?.('goods-receipt');const br=document.getElementById('gr-branch');if(br)br.value=p.branch;populateOpenPo();const sel=document.getElementById('gr-po');if(sel)sel.value=p.id;loadPoForReceipt();window.scrollTo({top:0,behavior:'smooth'});}
function populateOpenPo(){
  const sel=document.getElementById('gr-po');if(!sel)return;const branch=document.getElementById('gr-branch')?.value||'ubon',cur=sel.value;
  const rows=poRows().filter(p=>canSeeBranch(p.branch)).map(p=>({...p,status:recalcPoStatus(p)})).filter(p=>p.branch===branch&&!['received','cancelled'].includes(p.status));
  sel.innerHTML='<option value="">— เลือก PO —</option>'+rows.map(p=>`<option value="${esc(p.id)}">${esc(p.no)} · ${esc(p.supplier)} · คงค้าง ${p.items.reduce((s,i)=>s+poOutstanding(p,i),0)} หน่วย</option>`).join('');if(rows.some(p=>p.id===cur))sel.value=cur;
}
function loadPoForReceipt(){
  const idv=document.getElementById('gr-po')?.value,p=poRows().find(x=>x.id===idv),tb=document.getElementById('gr-items-body');if(!tb)return;tb.innerHTML='';document.getElementById('gr-supplier').value=p?.supplier||'';if(!p)return;
  p.items.forEach(i=>{const received=poReceivedQty(p.id,productKey(i)),out=Math.max(0,num(i.qty)-received);if(out<=0)return;const tr=document.createElement('tr');tr.dataset.productCode=i.productCode||'';tr.innerHTML=`<td><b>${esc(i.product)}</b><small>${esc(i.productCode||'')}</small></td><td class="tn">${qtyFmt(i.qty)}</td><td class="tn">${qtyFmt(received)}</td><td class="tn"><b>${qtyFmt(out)}</b></td><td><input data-f="receive" type="number" min="0" max="${out}" step="0.01" value="${out}"></td><td>${esc(i.unit||'')}</td><td class="tn">฿${money(i.unitCost)}</td>`;tr.dataset.product=i.product||'';tr.dataset.unit=i.unit||'';tr.dataset.cost=String(i.unitCost||0);tr.dataset.outstanding=String(out);tb.appendChild(tr);});
}
function resetGr(){const d=document.getElementById('gr-date');if(d)d.value=today();const tb=document.getElementById('gr-items-body');if(tb)tb.innerHTML='';const s=document.getElementById('gr-supplier');if(s)s.value='';const n=document.getElementById('gr-note');if(n)n.value='';refreshGrNo();populateOpenPo();}
function postGoodsReceipt(){
  const poId=document.getElementById('gr-po')?.value,p=poRows().find(x=>x.id===poId);if(!p)return window.notify?.('กรุณาเลือกใบสั่งซื้อ');const date=document.getElementById('gr-date')?.value,branch=lockedBranch()||document.getElementById('gr-branch')?.value||'';if(!date||!branch)return window.notify?.('กรุณาระบุวันที่และสาขา');
  const items=[...document.querySelectorAll('#gr-items-body tr')].map(tr=>({productCode:tr.dataset.productCode||'',product:tr.dataset.product||'',unit:tr.dataset.unit||'ชิ้น',unitCost:num(tr.dataset.cost),outstanding:num(tr.dataset.outstanding),qty:num(tr.querySelector('[data-f="receive"]')?.value)})).filter(i=>i.qty>0);
  if(!items.length)return window.notify?.('กรุณากรอกจำนวนรับอย่างน้อย 1 รายการ');const over=items.find(i=>i.qty>i.outstanding+0.000001);if(over)return window.notify?.(`จำนวนรับ ${over.product} มากกว่าจำนวนค้างรับ`);
  const no=document.getElementById('gr-no')?.value||docNo('GR',KEYS.goodsReceipts,date);if(grRows().some(g=>g.no===no))return window.notify?.(`เลขที่รับสินค้า ${no} มีอยู่แล้ว`);
  const gr={id:id('gr'),no,date,branch,poId:p.id,poNo:p.no,supplier:p.supplier,items,subtotal:items.reduce((s,i)=>s+i.qty*i.unitCost,0),note:document.getElementById('gr-note')?.value.trim()||'',status:'posted',createdAt:nowIso(),updatedAtIso:nowIso()};const grs=grRows();grs.unshift(gr);saveGrRows(grs);cloudSave('goodsReceipts',gr);
  const moves=movementRows();items.forEach(i=>{const mv={id:id('mv'),date,branch,kind:'receipt',qty:i.qty,productCode:i.productCode,product:i.product,unit:i.unit,unitCost:i.unitCost,refType:'goods_receipt',refId:gr.id,refNo:gr.no,poNo:p.no,note:`รับสินค้าจาก ${p.supplier}`,createdAt:nowIso(),updatedAtIso:nowIso()};moves.unshift(mv);cloudSave('inventoryMovements',mv);});saveMovementRows(moves);
  const pos=poRows(),idx=pos.findIndex(x=>x.id===p.id);if(idx>=0){pos[idx].status=recalcPoStatus(pos[idx]);pos[idx].updatedAt=nowIso();pos[idx].updatedAtIso=nowIso();savePoRows(pos);cloudSave('purchaseOrders',pos[idx]);}audit('post','goods_receipt',gr.no,`รับสินค้า ${items.length} รายการ อ้างอิง ${p.no} · ฿${money(gr.subtotal)}`,{branch});window.notify?.('Post รับสินค้าเข้าคลังเรียบร้อย');resetGr();renderGoodsReceipts();renderPoList();renderInventory();window.renderMasterData?.();
}
function renderGoodsReceipts(){
  const root=document.getElementById('gr-list-table');if(!root)return;const rows=grRows().filter(g=>canSeeBranch(g.branch)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));document.getElementById('gr-list-count').textContent=`${rows.length} ใบ`;
  if(!rows.length){root.innerHTML='<div class="empty">ยังไม่มีการรับสินค้า</div>';return;}
  root.innerHTML=`<div class="tbl-wrap"><table class="prodcore-table"><thead><tr><th>GR</th><th>วันที่</th><th>สาขา</th><th>PO</th><th>ผู้จำหน่าย</th><th>มูลค่า</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows.map(g=>`<tr><td><b>${esc(g.no)}</b></td><td>${esc(g.date)}</td><td>${esc(BRANCH_LABEL[g.branch]||g.branch)}</td><td>${esc(g.poNo||'-')}</td><td>${esc(g.supplier||'-')}</td><td class="tn">฿${money(g.subtotal)}</td><td>${statusPill(g.reversed?'reversed':'posted')}</td><td>${!g.reversed?`<button class="btn btn-danger btn-sm" onclick="pcReverseGr('${g.id}')">กลับรายการ</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
}
function reverseGr(idv){const grs=grRows(),g=grs.find(x=>x.id===idv);if(!g||g.reversed)return;if(!confirm(`กลับรายการรับสินค้า ${g.no} ใช่หรือไม่? Stock จะถูกลดคืนตามจำนวนที่รับ`))return;const moves=movementRows();(g.items||[]).forEach(i=>{const mv={id:id('mv'),date:today(),branch:g.branch,kind:'receipt_reversal',qty:-num(i.qty),productCode:i.productCode,product:i.product,unit:i.unit,unitCost:i.unitCost,refType:'goods_receipt_reversal',refId:g.id,refNo:g.no,note:`กลับรายการ ${g.no}`,createdAt:nowIso(),updatedAtIso:nowIso()};moves.unshift(mv);cloudSave('inventoryMovements',mv);});saveMovementRows(moves);g.reversed=true;g.reversedAt=nowIso();g.updatedAtIso=nowIso();saveGrRows(grs);cloudSave('goodsReceipts',g);const pos=poRows(),p=pos.find(x=>x.id===g.poId);if(p){p.status=recalcPoStatus(p);p.updatedAt=nowIso();p.updatedAtIso=nowIso();savePoRows(pos);cloudSave('purchaseOrders',p);}audit('post','goods_receipt',g.no,'กลับรายการรับสินค้าและสร้าง Stock Movement ติดลบ',{branch:g.branch});renderGoodsReceipts();renderPoList();populateOpenPo();renderInventory();window.renderMasterData?.();}

function postAdjustment(){
  const date=document.getElementById('adj-date')?.value,branch=lockedBranch()||document.getElementById('adj-branch')?.value,productName=document.getElementById('adj-product')?.value.trim(),type=document.getElementById('adj-type')?.value,qty=num(document.getElementById('adj-qty')?.value),reason=document.getElementById('adj-reason')?.value.trim();const p=productBy(productName);
  if(!date||!branch||!p||qty<=0||!reason)return window.notify?.('กรุณากรอกวันที่ สาขา สินค้า จำนวน และเหตุผลให้ครบ');if(!branchActive(branch))return window.notify?.('สาขานี้ยังไม่เปิดใช้งานในแพ็กเกจ');if(p.fulfillmentType!=='stock'||p.flowType!=='inventory')return window.notify?.('Stock Adjustment ใช้กับสินค้า Inventory / สินค้าในสต็อกเท่านั้น');const delta=type==='decrease'?-qty:qty;if(delta<0&&stockOnHand(p,branch)<qty-0.000001)return window.notify?.(`Stock ไม่พอ: ${p.name} มี ${qtyFmt(stockOnHand(p,branch))} ${p.unit||''}`);
  const rows=movementRows();const mv={id:id('mv'),date,branch,kind:'adjustment',qty:delta,productCode:p.code||'',product:p.name,unit:p.unit||'',unitCost:p.standardCost||0,refType:'adjustment',refNo:`ADJ-${Date.now()}`,note:reason,createdAt:nowIso(),updatedAtIso:nowIso()};rows.unshift(mv);saveMovementRows(rows);cloudSave('inventoryMovements',mv);audit('adjust','inventory',p.code||p.name,`${delta>0?'เพิ่ม':'ลด'} Stock ${qtyFmt(qty)} ${p.unit||''} · ${reason}`,{branch});document.getElementById('adj-qty').value='';document.getElementById('adj-reason').value='';renderInventory();window.renderMasterData?.();window.notify?.('บันทึก Stock Adjustment เรียบร้อย');
}
function postTransfer(){
  const date=document.getElementById('transfer-date')?.value||today(),productName=document.getElementById('transfer-product')?.value.trim(),from=lockedBranch()||document.getElementById('transfer-from')?.value,to=document.getElementById('transfer-to')?.value,qty=num(document.getElementById('transfer-qty')?.value),note=document.getElementById('transfer-note')?.value.trim()||'';const p=productBy(productName);
  if(!p||!from||!to||qty<=0)return window.notify?.('กรุณากรอกสินค้า ต้นทาง ปลายทาง และจำนวนให้ครบ');if(!branchActive(from)||!branchActive(to))return window.notify?.('ต้นทางหรือปลายทางยังไม่เปิดใช้งานในแพ็กเกจ');if(from===to)return window.notify?.('สาขาต้นทางและปลายทางต้องไม่ใช่สาขาเดียวกัน');if(p.flowType!=='inventory'||p.fulfillmentType!=='stock')return window.notify?.('Stock Transfer ใช้กับสินค้า Inventory / สินค้าในสต็อกเท่านั้น');const available=stockOnHand(p,from);if(available<qty-0.000001)return window.notify?.(`Stock ต้นทางไม่พอ: ${p.name} มี ${qtyFmt(available)} ${p.unit||''}`);
  const d=new Date(`${date}T00:00:00`),ref=`TRF${String(d.getFullYear()+543).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}${String(Date.now()).slice(-5)}`;const common={date,productCode:p.code||'',product:p.name,unit:p.unit||'',unitCost:p.standardCost||0,refType:'stock_transfer',refNo:ref,createdAt:nowIso(),updatedAtIso:nowIso()};const out={id:id('mv'),...common,branch:from,kind:'transfer_out',qty:-qty,note:`โอนไป ${BRANCH_LABEL[to]}${note?` · ${note}`:''}`};const inn={id:id('mv'),...common,branch:to,kind:'transfer_in',qty:qty,note:`รับโอนจาก ${BRANCH_LABEL[from]}${note?` · ${note}`:''}`};const rows=movementRows();rows.unshift(inn,out);saveMovementRows(rows);cloudSave('inventoryMovements',out);cloudSave('inventoryMovements',inn);audit('adjust','inventory',ref,`โอน ${p.code||p.name} ${qtyFmt(qty)} ${p.unit||''} · ${BRANCH_LABEL[from]} → ${BRANCH_LABEL[to]}`,{branch:from});document.getElementById('transfer-qty').value='';document.getElementById('transfer-note').value='';renderInventory();renderOpsDashboard();window.renderMasterData?.();window.notify?.(`โอนสต็อกเรียบร้อย · ${ref}`);
}
function derivedSalesMovements(){
  const out=[];if(typeof window.docsForYear!=='function'||typeof window.allYears!=='function')return out;const years=window.allYears();
  ['ubon','khonkaen'].filter(branchActive).forEach(branch=>years.forEach(year=>{(window.docsForYear('invoices',year,branch)||[]).filter(inv=>!inv.voided&&!inv.cancelled).forEach(inv=>(inv.items||[]).forEach(i=>{const p=productBy(i.product,i.productCode);if(!p||p.fulfillmentType!=='stock'||p.flowType!=='inventory')return;out.push({id:`sale-${branch}-${year}-${inv.id}-${p.code||p.name}`,date:inv.date||'',branch,kind:'sale',qty:-num(i.qty),productCode:p.code||i.productCode||'',product:p.name||i.product,unit:i.unit||p.unit||'',unitCost:num(i.costUnit||p.standardCost),refType:'invoice',refNo:inv.no||'',note:`ตัดสต็อกจากใบส่งสินค้า / ใบกำกับภาษี ${inv.no||''}`,createdAt:inv.createdAt||inv.date||''});}));}));return out;
}
function allMovements(){return [...movementRows(),...derivedSalesMovements()].sort((a,b)=>String(b.date||b.createdAt).localeCompare(String(a.date||a.createdAt))||String(b.createdAt).localeCompare(String(a.createdAt)));}
function renderInventory(){
  const root=document.getElementById('inventory-stock-table');if(!root)return;const requestedBranch=document.getElementById('inv-branch-filter')?.value||'all',branch=lockedBranch()||requestedBranch,search=normalize(document.getElementById('inv-search')?.value||'');const rows=productRows().filter(p=>p.flowType==='inventory'&&p.fulfillmentType==='stock').filter(p=>!search||normalize(`${p.code} ${p.name} ${p.category}`).includes(search));
  const enriched=rows.map(p=>{const ub=stockOnHand(p,'ubon'),kk=stockOnHand(p,'khonkaen'),on=branch==='ubon'?ub:branch==='khonkaen'?kk:ub+kk;return{...p,ub,kk,on,low:on<=num(p.reorderPoint),value:on*num(p.standardCost)};});const low=enriched.filter(r=>r.low).length,totalQty=enriched.reduce((s,r)=>s+r.on,0),value=enriched.reduce((s,r)=>s+r.value,0);
  const k=document.getElementById('inventory-kpis');if(k)k.innerHTML=`<div><small>Inventory SKU</small><b>${enriched.length}</b><span>สินค้าในสต็อก</span></div><div><small>Stock On Hand</small><b>${qtyFmt(totalQty)}</b><span>${branch==='all'?'รวมทุกสาขา':BRANCH_LABEL[branch]}</span></div><div class="${low?'risk':''}"><small>Reorder Alert</small><b>${low}</b><span>ต่ำกว่าหรือเท่า Reorder Point</span></div><div><small>Inventory Value</small><b>฿${money(value)}</b><span>อิงต้นทุนมาตรฐาน</span></div>`;
  if(!enriched.length)root.innerHTML='<div class="empty">ยังไม่มีสินค้า Inventory / Stock ใน Product Master</div>';else root.innerHTML=`<div class="tbl-wrap"><table class="prodcore-table stock-table"><thead><tr><th>SKU / สินค้า</th>${branch==='all'?'<th>สำนักงานใหญ่</th><th>สาขา 00001</th>':''}<th>คงเหลือ</th><th>Reorder</th><th>ต้นทุนมาตรฐาน</th><th>มูลค่า</th><th>สถานะ</th></tr></thead><tbody>${enriched.map(r=>`<tr class="${r.low?'stock-low':''}"><td><b>${esc(r.code||'-')}</b><br>${esc(r.name)}<small>${esc(r.category||'')}</small></td>${branch==='all'?`<td class="tn">${qtyFmt(r.ub)}</td><td class="tn">${qtyFmt(r.kk)}</td>`:''}<td class="tn"><b>${qtyFmt(r.on)}</b> ${esc(r.unit||'')}</td><td class="tn">${qtyFmt(r.reorderPoint)}</td><td class="tn">฿${money(r.standardCost)}</td><td class="tn">฿${money(r.value)}</td><td>${r.low?'<span class="badge b-red">ควรสั่งซื้อ</span>':'<span class="badge b-green">ปกติ</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  renderMovementTable();
}
function renderMovementTable(){const root=document.getElementById('inventory-movement-table');if(!root)return;const requestedBranch=document.getElementById('inv-branch-filter')?.value||'all',branch=lockedBranch()||requestedBranch;const rows=allMovements().filter(r=>canSeeBranch(r.branch)&&(branch==='all'||r.branch===branch)).slice(0,250);document.getElementById('inventory-movement-count').textContent=`แสดง ${rows.length} รายการ`;if(!rows.length){root.innerHTML='<div class="empty">ยังไม่มี Stock Movement</div>';return;}root.innerHTML=`<div class="tbl-wrap"><table class="prodcore-table"><thead><tr><th>วันที่</th><th>สาขา</th><th>สินค้า</th><th>ประเภท</th><th>อ้างอิง</th><th>เข้า</th><th>ออก</th><th>หมายเหตุ</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.date||'-')}</td><td>${esc(BRANCH_LABEL[r.branch]||r.branch||'-')}</td><td><b>${esc(r.productCode||'-')}</b><br>${esc(r.product||'')}</td><td>${esc({receipt:'รับสินค้า',receipt_reversal:'กลับรายการรับ',adjustment:'Adjustment',sale:'ขาย/ส่งสินค้า',transfer_out:'โอนออก',transfer_in:'รับโอน'}[r.kind]||r.kind)}</td><td>${esc(r.refNo||'-')}</td><td class="tn pos">${r.qty>0?qtyFmt(r.qty):'-'}</td><td class="tn neg">${r.qty<0?qtyFmt(Math.abs(r.qty)):'-'}</td><td>${esc(r.note||'')}</td></tr>`).join('')}</tbody></table></div>`;}
function validateInvoiceStock(branch,items,editId=''){
  const shortages=[];for(const i of items||[]){const p=productBy(i.product,i.productCode);if(!p||p.fulfillmentType!=='stock'||p.flowType!=='inventory')continue;let available=availableStock(p,branch);
    // Editing an existing invoice: add its old quantity back before validating the replacement quantity.
    if(editId&&typeof window.docsForYear==='function'&&typeof window.allYears==='function')for(const y of window.allYears()){const old=(window.docsForYear('invoices',y,branch)||[]).find(x=>String(x.id)===String(editId));if(old){for(const oi of old.items||[]){const op=productBy(oi.product,oi.productCode);if(op&&productKey(op)===productKey(p))available+=num(oi.qty);}break;}}
    if(num(i.qty)>available+0.000001)shortages.push(`${p.code||''} ${p.name}: ต้องการ ${qtyFmt(i.qty)} แต่มี ${qtyFmt(available)} ${p.unit||''}`);
  }return shortages.length?{ok:false,message:'Stock ไม่เพียงพอ\n'+shortages.join('\n')+'\nกรุณารับสินค้าเข้าคลังหรือปรับจำนวนก่อนออกใบส่งสินค้า'}:{ok:true};
}

function renderAudit(){
  const root=document.getElementById('audit-table');if(!root)return;const action=document.getElementById('audit-action')?.value||'',search=normalize(document.getElementById('audit-search')?.value||'');const all=read(KEYS.audit).filter(r=>canSeeBranch(r.branch)||!r.branch),rows=all.filter(r=>(!action||r.action===action)&&(!search||normalize(`${r.entity} ${r.ref} ${r.detail} ${r.user}`).includes(search))).slice(0,500),trash=read(KEYS.trash).filter(t=>canSeeBranch(t.branch));
  const todayPrefix=today();const k=document.getElementById('audit-kpis');if(k)k.innerHTML=`<div><small>Audit Events</small><b>${all.length}</b><span>เก็บสูงสุด 2,500 รายการ</span></div><div><small>วันนี้</small><b>${all.filter(r=>String(r.at).startsWith(todayPrefix)).length}</b><span>กิจกรรมวันนี้</span></div><div><small>Recycle Bin</small><b>${trash.length}</b><span>สำเนาก่อนลบ</span></div><div><small>Stock Control</small><b>${movementRows().filter(r=>canSeeBranch(r.branch)).length}</b><span>Movement ที่บันทึกจริง</span></div>`;
  const auditHtml=rows.length?`<div class="tbl-wrap"><table class="prodcore-table"><thead><tr><th>เวลา</th><th>Action</th><th>ประเภท</th><th>อ้างอิง</th><th>สาขา</th><th>รายละเอียด</th><th>User</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(new Date(r.at).toLocaleString('th-TH'))}</td><td><span class="audit-action ${esc(r.action)}">${esc(r.action.toUpperCase())}</span></td><td>${esc(ENTITY_LABEL[r.entity]||r.entity)}</td><td><b>${esc(r.ref||'-')}</b></td><td>${esc(BRANCH_LABEL[r.branch]||r.branch||'-')}</td><td>${esc(r.detail||'')}</td><td>${esc(r.user||'-')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">ยังไม่มี Audit Log ตามเงื่อนไข</div>';
  const trashHtml=trash.length?`<div class="prodcore-trash"><h4>♻️ Recycle Bin · รายการที่ลบล่าสุด</h4><div class="tbl-wrap"><table class="prodcore-table"><thead><tr><th>ลบเมื่อ</th><th>ประเภท</th><th>เลขเอกสาร</th><th>สาขา</th><th></th></tr></thead><tbody>${trash.slice(0,30).map(t=>`<tr><td>${esc(new Date(t.deletedAt).toLocaleString('th-TH'))}</td><td>${esc(ENTITY_LABEL[t.type]||t.type)}</td><td>${esc(t.record?.no||t.record?.id||'-')}</td><td>${esc(BRANCH_LABEL[t.branch]||t.branch)}</td><td><button class="btn btn-view btn-sm" onclick="pcRestoreTrash('${t.id}')">กู้คืน</button></td></tr>`).join('')}</tbody></table></div></div>`:'';
  root.innerHTML=auditHtml+trashHtml;
}
async function restoreTrash(idv){
  const trash=read(KEYS.trash),idx=trash.findIndex(x=>x.id===idv);if(idx<0)return;const t=trash[idx];if(!canSeeBranch(t.branch))return window.notify?.('ไม่มีสิทธิ์กู้คืนข้อมูลของสาขานี้');if(!confirm(`กู้คืน ${t.record?.no||t.record?.id||''} กลับสู่ข้อมูลหลักใช่หรือไม่?`))return;
  if(typeof window.loadFor!=='function'||typeof window.saveFor!=='function')return window.notify?.('เวอร์ชันนี้ไม่สามารถกู้คืนข้อมูลหลักได้');const d=window.loadFor(t.branch,t.year,t.month);d[t.type]=d[t.type]||[];if(d[t.type].some(x=>String(x.id)===String(t.record.id)))return window.notify?.('รายการนี้มีอยู่ในข้อมูลหลักแล้ว');d[t.type].push(t.record);window.saveFor(t.branch,t.year,t.month,d);
  const saveMap={quotes:'saveQuote',invoices:'saveInvoice',receipts:'saveReceipt',expenses:'saveExpense',productions:'saveProduction'};const fn=saveMap[t.type];if(fn&&window.FirebaseService?.[fn])window.FirebaseService[fn]({...t.record,branch:t.branch,year:t.year,month:t.month}).catch(()=>{});
  trash.splice(idx,1);write(KEYS.trash,trash);audit('create',t.type,t.record?.no||t.record?.id||'','กู้คืนจาก Recycle Bin',{branch:t.branch});window.notify?.('กู้คืนรายการแล้ว');renderAudit();window.renderDash?.();
}
function exportAudit(){const rows=read(KEYS.audit).filter(r=>canSeeBranch(r.branch)||!r.branch);const head=['Timestamp','Action','Entity','Reference','Branch','Detail','User'];const lines=[head,...rows.map(r=>[r.at,r.action,ENTITY_LABEL[r.entity]||r.entity,r.ref,BRANCH_LABEL[r.branch]||r.branch,r.detail,r.user])].map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(','));const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`audit-log-${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}
function exportData(){const visible=r=>canSeeBranch(r.branch);return{purchaseOrders:poRows().filter(visible),goodsReceipts:grRows().filter(visible),inventoryMovements:read(KEYS.inventoryMovements).filter(visible),audit:read(KEYS.audit).filter(r=>visible(r)||!r.branch),trash:read(KEYS.trash).filter(visible),version:2};}
function importData(data={}){const locked=lockedBranch(),scope=rows=>Array.isArray(rows)?rows.filter(r=>!locked||r.branch===locked):null;if(Array.isArray(data.purchaseOrders))write(KEYS.purchaseOrders,mergeCloudRows(poRows(),scope(data.purchaseOrders)));if(Array.isArray(data.goodsReceipts))write(KEYS.goodsReceipts,mergeCloudRows(grRows(),scope(data.goodsReceipts)));if(Array.isArray(data.inventoryMovements))write(KEYS.inventoryMovements,mergeCloudRows(read(KEYS.inventoryMovements),scope(data.inventoryMovements)));if(Array.isArray(data.audit))write(KEYS.audit,mergeCloudRows(read(KEYS.audit),scope(data.audit)));if(Array.isArray(data.trash))write(KEYS.trash,mergeCloudRows(read(KEYS.trash),scope(data.trash)));}


function renderOpsDashboard(){
  const k=document.getElementById('prodcore-dashboard-kpis'),alerts=document.getElementById('prodcore-dashboard-alerts');if(!k&&!alerts)return;
  const scope=lockedBranch();const products=productRows().filter(p=>p.flowType==='inventory'&&p.fulfillmentType==='stock');const stock=products.map(p=>({...p,on:stockOnHand(p,scope),value:stockOnHand(p,scope)*num(p.standardCost)}));const low=stock.filter(p=>p.on<=num(p.reorderPoint));const pos=poRows().filter(p=>canSeeBranch(p.branch)).map(p=>({...p,status:recalcPoStatus(p)}));const open=pos.filter(p=>!['received','cancelled'].includes(p.status));const overdue=open.filter(p=>p.expectedDate&&p.expectedDate<today());const value=stock.reduce((s,p)=>s+p.value,0);const pendingUnits=open.reduce((s,p)=>s+(p.items||[]).reduce((ss,i)=>ss+poOutstanding(p,i),0),0);
  if(k)k.innerHTML=`<div><small>Open Purchase Orders</small><b>${open.length}</b><span>PO ที่ยังรับไม่ครบ</span></div><div class="${overdue.length?'risk':''}"><small>PO Overdue</small><b>${overdue.length}</b><span>เลยกำหนดรับสินค้า</span></div><div class="${low.length?'risk':''}"><small>Reorder Alert</small><b>${low.length}</b><span>SKU ต่ำกว่า Reorder Point</span></div><div><small>Inventory Value</small><b>฿${money(value)}</b><span>Pending receipt ${qtyFmt(pendingUnits)} หน่วย</span></div>`;
  if(alerts){const rows=[];overdue.slice(0,3).forEach(p=>rows.push(`<div class="target-alert danger"><b>PO เลยกำหนด · ${esc(p.no)}</b><span>${esc(p.supplier)} · กำหนดรับ ${esc(p.expectedDate)}</span></div>`));low.slice(0,4).forEach(p=>rows.push(`<div class="target-alert warn"><b>ควรสั่งซื้อ · ${esc(p.code||p.name)}</b><span>${esc(p.name)} คงเหลือ ${qtyFmt(p.on)} ${esc(p.unit||'')} · Reorder ${qtyFmt(p.reorderPoint)}</span></div>`));if(!rows.length)rows.push('<div class="target-alert ok"><b>Operational Control ปกติ</b><span>ไม่พบ PO เลยกำหนดหรือสินค้า Stock ต่ำกว่า Reorder Point</span></div>');alerts.innerHTML=rows.join('');}
}
function renderPage(idv){enforceOperationalBranchUi();if(idv==='dashboard')renderOpsDashboard();if(idv==='purchase-order'){if(!document.getElementById('po-date')?.value)resetPo();renderPoList();}if(idv==='goods-receipt'){if(!document.getElementById('gr-date')?.value)resetGr();renderGoodsReceipts();populateOpenPo();}if(idv==='inventory'){const a=document.getElementById('adj-date');if(a&&!a.value)a.value=today();renderInventory();}if(idv==='audit-log')renderAudit();}
function installNavigationHook(){const original=window.go;if(typeof original!=='function'||original.__prodCore)return false;const wrapped=function(idv,el){const r=original(idv,el);renderPage(idv);return r;};wrapped.__prodCore=true;window.go=wrapped;return true;}
function savedDocumentExists(entity,ref,branch){
  const map={quote:'quotes',production:'productions',invoice:'invoices',receipt:'receipts'};const type=map[entity];if(!type||!ref||!branch||typeof window.docsForYear!=='function'||typeof window.allYears!=='function')return false;
  return window.allYears().some(y=>(window.docsForYear(type,y,branch)||[]).some(x=>String(x.no||'').trim()===String(ref).trim()));
}
function wrapDocumentHandlers(){
  const specs=[['saveQuote','quote','q-no','q-edit-banner'],['saveProduction','production','p-no','p-edit-banner'],['saveInvoice','invoice','i-no','i-edit-banner'],['saveReceipt','receipt','r-no','r-edit-banner']];
  specs.forEach(([name,entity,inputId,bannerId])=>{const orig=window[name];if(typeof orig!=='function'||orig.__prodCore)return;const fn=async function(...args){const ref=document.getElementById(inputId)?.value.trim()||'',editing=document.getElementById(bannerId)?.style.display!=='none';const br=branchFromForm(inputId[0]);const existedBefore=savedDocumentExists(entity,ref,br);const result=await orig(...args);const existsAfter=savedDocumentExists(entity,ref,br);if(ref&&existsAfter)audit((editing||existedBefore)?'update':'create',entity,ref,`${editing||existedBefore?'แก้ไข':'บันทึก'} ${ENTITY_LABEL[entity]||entity}`,{branch:br});if(entity==='invoice'&&existsAfter)renderInventory();return result;};fn.__prodCore=true;window[name]=fn;});
  const exp=window.saveExpense;if(typeof exp==='function'&&!exp.__prodCore){const fn=function(...args){const before=typeof window.allYears==='function'?window.allYears().reduce((s,y)=>s+(window.docsForYear?.('expenses',y,null)||[]).length,0):0;const br=branchFromForm('e'),amount=document.getElementById('e-amount')?.value||'';const r=exp(...args);const after=typeof window.allYears==='function'?window.allYears().reduce((s,y)=>s+(window.docsForYear?.('expenses',y,null)||[]).length,0):before;if(after>before)audit('create','expense',document.getElementById('e-doc-no')?.value||'',`บันทึกค่าใช้จ่าย ${amount?`฿${amount}`:''}`,{branch:br});return r;};fn.__prodCore=true;window.saveExpense=fn;}
  const paid=window.toggleInvoicePaid;if(typeof paid==='function'&&!paid.__prodCore){const fn=async function(br,y,m,idv,checked){const before=(window.docsForYear?.('invoices',Number(y),br)||[]).find(x=>String(x.id)===String(idv));const r=await paid(br,y,m,idv,checked);const after=(window.docsForYear?.('invoices',Number(y),br)||[]).find(x=>String(x.id)===String(idv));if(after&&before?.paymentStatus!==after.paymentStatus)audit('payment','invoice',after.no||String(idv),checked?'เปลี่ยนสถานะเป็นชำระแล้ว':'ยกเลิกสถานะชำระแล้ว',{branch:br});return r;};fn.__prodCore=true;window.toggleInvoicePaid=fn;}
  const customerSave=window.saveCustomerMaster;if(typeof customerSave==='function'&&!customerSave.__prodCore){const fn=function(...args){const name=document.getElementById('md-c-name')?.value.trim()||'';const before=window.contactMasterRows?.().some(r=>normalize(r.name)===normalize(name));const r=customerSave(...args);const after=window.contactMasterRows?.().some(r=>normalize(r.name)===normalize(name));if(name&&after)audit(before?'update':'create','customer',name,`${before?'แก้ไข':'บันทึก'} Customer Master`);return r;};fn.__prodCore=true;window.saveCustomerMaster=fn;}
  const supplierSave=window.saveSupplierMaster;if(typeof supplierSave==='function'&&!supplierSave.__prodCore){const fn=function(...args){const name=document.getElementById('md-s-name')?.value.trim()||'';const before=window.contactMasterRows?.().some(r=>normalize(r.name)===normalize(name));const r=supplierSave(...args);const after=window.contactMasterRows?.().some(r=>normalize(r.name)===normalize(name));if(name&&after)audit(before?'update':'create','supplier',name,`${before?'แก้ไข':'บันทึก'} Supplier Master`);return r;};fn.__prodCore=true;window.saveSupplierMaster=fn;}
}
function installStockValidation(){const orig=window.saveInvoice;if(typeof orig!=='function'||orig.__stockGuard)return false;const fn=async function(...args){const branch=branchFromForm('i');const items=[...document.querySelectorAll('#i-items-body tr')].map(tr=>({product:tr.querySelector('[data-field="product"]')?.value||'',productCode:tr.querySelector('[data-field="product"]')?.dataset.productCode||'',qty:num(tr.querySelector('[data-field="qty"]')?.value)})).filter(i=>i.product&&i.qty>0);const editBanner=document.getElementById('i-edit-banner');let editId='';if(editBanner?.style.display!=='none'){const no=document.getElementById('i-no')?.value||'';if(typeof window.allYears==='function')for(const y of window.allYears()){const old=(window.docsForYear?.('invoices',y,branch)||[]).find(x=>x.no===no);if(old){editId=old.id;break;}}}const check=validateInvoiceStock(branch,items,editId);if(!check.ok){window.notify?.(check.message);return;}return orig(...args);};fn.__stockGuard=true;window.saveInvoice=fn;return true;}
function installDeleteTrashHook(){/* delDoc snapshots are injected directly in app.js to avoid storing cancelled confirmations. */}

const API={KEYS,audit,trashSnapshot,inventoryMovementNet,stockOnHand,validateInvoiceStock,exportData,importData,syncOperationalFromCloud};window.ERPProductionCore=API;
Object.assign(window,{pcRefreshPoNo:refreshPoNo,pcRefreshGrNo:refreshGrNo,pcApplySupplierToPo:applySupplierToPo,pcAddPoItem:addPoItem,pcApplyPoProduct:applyPoProduct,pcCalcPo:calcPo,pcResetPo:resetPo,pcSavePo:savePo,pcUsePoForReceipt:usePoForReceipt,pcCancelPo:cancelPo,pcPopulateOpenPo:populateOpenPo,pcLoadPoForReceipt:loadPoForReceipt,pcPostGoodsReceipt:postGoodsReceipt,pcReverseGr:reverseGr,pcRenderInventory:renderInventory,pcPostAdjustment:postAdjustment,pcPostTransfer:postTransfer,pcRenderAudit:renderAudit,pcExportAudit:exportAudit,pcRestoreTrash:restoreTrash});

function boot(){installNavigationHook();wrapDocumentHandlers();installStockValidation();enforceOperationalBranchUi();const pd=document.getElementById('po-date');if(pd&&!pd.value)pd.value=today();const gd=document.getElementById('gr-date');if(gd&&!gd.value)gd.value=today();const ad=document.getElementById('adj-date');if(ad&&!ad.value)ad.value=today();const td=document.getElementById('transfer-date');if(td&&!td.value)td.value=today();refreshPoNo();refreshGrNo();if(document.getElementById('po-items-body')&&!document.querySelector('#po-items-body tr'))addPoItem();window.renderMasterData?.();renderOpsDashboard();audit('system','inventory','SYSTEM','เปิดใช้งาน Production-like Core: Purchase, Goods Receipt, Inventory, Audit');setTimeout(syncOperationalFromCloud,900);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,50));else setTimeout(boot,50);

window.addEventListener('comform-auth-ready',()=>setTimeout(()=>{enforceOperationalBranchUi();syncOperationalFromCloud();renderOpsDashboard();renderPoList();renderGoodsReceipts();renderInventory();renderAudit();},500));
