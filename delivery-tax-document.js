const html2canvas = (...args) => {
  if (typeof window.html2canvas !== 'function') return Promise.reject(new Error('ยังโหลด html2canvas ไม่สำเร็จ'));
  return window.html2canvas(...args);
};
const jsPDF = window.jspdf?.jsPDF;

const DTD_STORAGE_KEY = 'comform_delivery_tax_document_draft_v1';
const tenantStorageKey = key => window.ComformTenant?.storageKey?.(key) || key;
const businessStorageKey = (branch,year,month) => tenantStorageKey(`biz2_${branch}_${year}_${String(Number(month)+1).padStart(2,'0')}`);
const MAX_ITEMS = 60;
const ITEM_UNITS_PER_PAGE = 8;
const BLUE = '#0868c9';
const COMPANY_LOGO_URL = new URL('./logo.png', import.meta.url).href;
let pdfLogoDataUrl = '';

const BRANCH_DEFAULTS = {
  khonkaen: {
    label: 'สาขาที่ 00001',
    companyNameTh: 'บริษัท ตัวอย่าง จำกัด (สาขาที่ 00001)',
    companyNameEn: 'EXAMPLE CO., LTD. (BRANCH 00001)',
    addressTh: '99/1 ถนนตัวอย่าง ตำบลในเมือง อำเภอเมืองขอนแก่น จังหวัดขอนแก่น 40000',
    addressEn: '99/1 Example Rd. T.Nai-Muang A.Muang Khonkaen Khonkaen 40000',
    phone: '000-000-0000',
    taxId: '0000000000000'
  },
  ubon: {
    label: 'สาขาสำนักงานใหญ่',
    companyNameTh: 'บริษัท ตัวอย่าง จำกัด (สาขาสำนักงานใหญ่)',
    companyNameEn: 'EXAMPLE CO., LTD. (HEAD OFFICE)',
    addressTh: '88/2 ถนนตัวอย่าง ตำบลในเมือง อำเภอเมือง จังหวัดอุบลราชธานี 34000',
    addressEn: '88/2 Example Rd. T.Nai-Muang A.Muang Ubonratchathani 34000',
    phone: 'Tel: 000-000-0000   Fax: 000-000-0000',
    taxId: '0000000000000'
  }
};


function branchCompany(branch) {
  const fallback = BRANCH_DEFAULTS[branch] || BRANCH_DEFAULTS.khonkaen;
  const profile = window.CurrentUser?.companyProfile || {};
  const branchProfile = profile?.branches?.[branch] || {};
  const tenantName = window.CurrentUser?.tenantName || window.CurrentUser?.companyName || '';
  return {
    ...fallback,
    ...branchProfile,
    companyNameTh: branchProfile.companyNameTh || branchProfile.nameTh || profile.companyNameTh || profile.nameTh || tenantName || fallback.companyNameTh,
    companyNameEn: branchProfile.companyNameEn || branchProfile.nameEn || profile.companyNameEn || profile.nameEn || fallback.companyNameEn,
    addressTh: branchProfile.addressTh || profile.addressTh || fallback.addressTh,
    addressEn: branchProfile.addressEn || profile.addressEn || fallback.addressEn,
    phone: branchProfile.phone || profile.phone || fallback.phone,
    taxId: branchProfile.taxId || profile.taxId || fallback.taxId,
    label: branchProfile.label || branchProfile.name || fallback.label
  };
}

const PAGE_TYPES = [
  {
    id: 'original',
    tab: 'ต้นฉบับ/ORIGINAL',
    titleTh: 'ใบส่งสินค้า/ใบกำกับภาษี',
    titleEn: '(DELIVERY ORDER / TAX INVOICE)',
    audience: 'สำหรับลูกค้า/CUSTOMER',
    note: '(เอกสารออกเป็นชุด)'
  },
  {
    id: 'copy',
    tab: 'สำเนา/COPY',
    titleTh: 'ใบส่งสินค้า/ใบกำกับภาษี',
    titleEn: '(DELIVERY ORDER / TAX INVOICE)',
    audience: 'สำหรับบัญชี/ACCOUNT',
    note: '(เอกสารออกเป็นชุด)'
  },
  {
    id: 'delivery-copy',
    tab: 'สำเนาใบส่งสินค้า/สำเนาใบกำกับภาษี',
    titleTh: 'ใบส่งสินค้า/สำเนาใบกำกับภาษี',
    titleEn: '(DELIVERY ORDER COPY / TAX INVOICE)',
    audience: 'สำหรับพนักงานส่งภายใน',
    note: '(เอกสารออกภายใน)'
  }
];

let state = createDefaultState();
let productionOptionsCache = [];
let productionOptionsLoadedKey = '';
let activePage = 'original';
let uploadedTemplateUrl = '';
let productionFilterYear = new Date().getFullYear();
let productionFilterMonth = '';
let productionFilterSearch = '';

function createDefaultState() {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  return {
    previewOnly: false,
    branch: 'khonkaen',
    company: { ...branchCompany('khonkaen') },
    customerName: '',
    customerAddress: '',
    customerTaxId: '',
    contact: '',
    phone: '',
    docNo: createDefaultDocNo(today),
    date: iso,
    dueDate: iso,
    salesperson: '',
    customerCode: '',
    poNo: '',
    doNo: '',
    paymentTerm: 'เงินสด',
    shipTo: '',
    buyerName: '',
    vatEnabled: true,
    note: '',
    attachments: [],
    sourceProductionNo: '',
    sourceProductionFirebaseId: '',
    sourceInvoiceNo: '',
    sourceInvoiceId: '',
    sourceInvoiceFirebaseId: '',
    sourceInvoiceBranch: '',
    sourceInvoiceYear: '',
    sourceInvoiceMonth: '',
    sourceQuoteNo: '',
    items: [createItem()]
  };
}

function createDefaultDocNo(date = new Date()) {
  const buddhistYear = date.getFullYear() + 543;
  const yy = String(buddhistYear).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `INV${yy}${mm}-0001`;
}

function createItem() {
  return {
    productCode: '',
    product: '',
    unit: 'ชิ้น',
    qty: 1,
    priceUnit: 0
  };
}

async function ensurePdfLogoDataUrl() {
  if (pdfLogoDataUrl) return pdfLogoDataUrl;
  try {
    const response = await fetch(COMPANY_LOGO_URL, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`โหลดโลโก้ไม่สำเร็จ (${response.status})`);
    const blob = await response.blob();
    pdfLogoDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('ไม่สามารถแปลงโลโก้เป็น Data URL ได้ จะใช้ URL ของไฟล์แทน', error);
    pdfLogoDataUrl = COMPANY_LOGO_URL;
  }
  return pdfLogoDataUrl;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

function parseMoney(value) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function fmt(value) {
  return Number(value || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(value) {
  if (!value) return '';
  const [y, m, d] = String(value).split('-');
  return y && m && d ? `${d}-${m}-${Number(y)+543}` : value;
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function totals() {
  const itemTotal = roundMoney(
    state.items.reduce(
      (sum, item) => sum + parseMoney(item.qty) * parseMoney(item.priceUnit),
      0
    )
  );

  // ทำตามสูตรที่ผู้ใช้กำหนด:
  // 1) รวม VAT 7%: มูลค่าสินค้า + VAT 7%
  // 2) ไม่รวม VAT 7%: ถอด VAT จากมูลค่าสินค้าด้วย ×100÷107
  //    แล้วนำมูลค่าก่อน VAT + VAT 7% กลับมาเป็นยอดรวมเดิม
  if (state.vatEnabled) {
    const subtotal = itemTotal;
    const vat = roundMoney(subtotal * 0.07);
    const grand = roundMoney(subtotal + vat);
    return { itemTotal, subtotal, vat, grand };
  }

  const subtotal = roundMoney(itemTotal * 100 / 107);
  const vat = roundMoney(itemTotal - subtotal);
  const grand = roundMoney(subtotal + vat);
  return { itemTotal, subtotal, vat, grand };
}

function thaiIntegerText(num) {
  const digits = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  const n = Math.floor(Math.abs(Number(num) || 0));
  if (n === 0) return 'ศูนย์';
  if (n >= 1000000) {
    const high = Math.floor(n / 1000000);
    const low = n % 1000000;
    return `${thaiIntegerText(high)}ล้าน${low ? thaiIntegerText(low) : ''}`;
  }
  const text = String(n).padStart(6, '0');
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    const digit = Number(text[i]);
    if (!digit) continue;
    const pos = 5 - i;
    if (pos === 1 && digit === 1) out += '';
    else if (pos === 1 && digit === 2) out += 'ยี่';
    else if (pos === 0 && digit === 1 && n > 10) out += 'เอ็ด';
    else out += digits[digit];
    out += positions[pos];
  }
  return out;
}

function bahtText(value) {
  const amount = Math.round((Number(value) || 0) * 100) / 100;
  const baht = Math.floor(amount);
  const satang = Math.round((amount - baht) * 100);
  const bahtPart = `${thaiIntegerText(baht)}บาท`;
  return satang ? `${bahtPart}${thaiIntegerText(satang)}สตางค์` : `${bahtPart}ถ้วน`;
}

function getLockedBranch() {
  const profile = window.ComformAuth?.getCurrentProfile?.() || window.CurrentUser || null;
  return profile?.branch && profile.branch !== 'all' ? profile.branch : '';
}

function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(tenantStorageKey(DTD_STORAGE_KEY)) || 'null');
    if (saved && typeof saved === 'object') {
      state = {
        ...createDefaultState(),
        ...saved,
        company: { ...branchCompany(saved.branch || 'khonkaen'), ...(saved.company || {}) },
        items: Array.isArray(saved.items) && saved.items.length ? saved.items.slice(0, MAX_ITEMS).map(item => ({ ...createItem(), ...item })) : [createItem()]
      };
    }
  } catch (error) {
    console.warn('อ่านร่างเอกสารไม่สำเร็จ', error);
  }
  const lockedBranch = getLockedBranch();
  if (lockedBranch && BRANCH_DEFAULTS[lockedBranch]) {
    state.branch = lockedBranch;
    state.company = { ...branchCompany(lockedBranch), ...state.company, label: branchCompany(lockedBranch).label };
  }
}

function persistDraft() {
  try {
    localStorage.setItem(tenantStorageKey(DTD_STORAGE_KEY), JSON.stringify(state));
  } catch (error) {
    console.warn('บันทึกร่างเอกสารไม่สำเร็จ', error);
  }
}

function mountFeature() {
  if (document.getElementById('panel-delivery-tax-doc')) return;

  const sidebar = document.querySelector('.sidebar');
  if (false && sidebar && !sidebar.querySelector('.dtd-billing-sec')) {
    const productionSec = [...sidebar.querySelectorAll('.nav-sec')].find(el => el.textContent.includes('ฝ่ายผลิต'));
    const sec = document.createElement('div');
    sec.className = 'nav-sec dtd-billing-sec';
    sec.textContent = 'เอกสารออกบิล';

    const nav = document.createElement('div');
    nav.className = 'nav-item dtd-nav-item';
    nav.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h8M9 17h8"/>
      </svg>
      ใบส่งสินค้า / ใบกำกับภาษี
    `;
    nav.addEventListener('click', () => {
      window.go?.('delivery-tax-doc', nav);
      renderAll();
    });

    if (productionSec) {
      productionSec.insertAdjacentElement('beforebegin', nav);
      nav.insertAdjacentElement('beforebegin', sec);
    } else {
      sidebar.appendChild(sec);
      sidebar.appendChild(nav);
    }
  }

  const main = document.querySelector('.main');
  if (!main) return;
  const panel = document.createElement('div');
  panel.id = 'panel-delivery-tax-doc';
  panel.className = 'panel';
  panel.innerHTML = '<div id="delivery-tax-app"></div>';
  main.appendChild(panel);

  loadDraft();
  renderAppShell();
  bindEvents();
  renderAll();
  applyLockedBranch();
  loadProductionOptions();
}

function renderAppShell() {
  const root = document.getElementById('delivery-tax-app');
  if (!root) return;
  root.innerHTML = `
    <div class="dtd-page-shell">
      <div class="dtd-toolbar">
        <div class="dtd-brand-title">
          <img src="${COMPANY_LOGO_URL}" alt="โลโก้บริษัท">
          <div>
            <div class="dtd-company-mini">${escapeHtml(window.CurrentUser?.tenantName || window.CurrentUser?.companyName || 'บริษัท')}</div>
            <h2>ออกใบส่งสินค้า / ใบกำกับภาษี</h2>
          </div>
        </div>
        <div class="dtd-toolbar-actions">
          <button type="button" class="dtd-btn" data-action="back-source">← กลับหน้ากรอกข้อมูล</button>
          <button type="button" class="dtd-btn dtd-btn-primary" data-action="save" ${state.previewOnly ? 'disabled title="กรุณาบันทึกข้อมูลใบส่งสินค้า / ใบกำกับภาษีก่อนบันทึกเอกสารออกจริง"' : ''}>💾 บันทึกเอกสาร</button>
          <button type="button" class="dtd-btn" data-action="print-current">🖨️ พิมพ์หน้าที่เลือก</button>
          <button type="button" class="dtd-btn" data-action="print-set">🖨️ พิมพ์ชุด</button>
          <button type="button" class="dtd-btn" data-action="pdf-current">⬇ PDF หน้าที่เลือก</button>
          <button type="button" class="dtd-btn dtd-btn-primary" data-action="pdf-set">📄 PDF ต้นฉบับ + สำเนา</button>
        </div>
      </div>

      <div class="dtd-workspace">
        <section class="dtd-editor-card">
          ${customerSectionHtml()}
          ${documentSectionHtml()}
          ${itemsSectionHtml()}
          ${summarySectionHtml()}
          ${sourceEvidenceHtml()}
          ${templateUploadHtml()}
        </section>

        <section class="dtd-preview-card">
          <div class="dtd-preview-heading">ตัวอย่างเอกสารแบบเรียลไทม์</div>
          <div class="dtd-preview-tabs" id="dtd-preview-tabs"></div>
          <div class="dtd-preview-scroll">
            <div id="dtd-live-preview"></div>
          </div>
          <div id="dtd-template-preview" class="dtd-template-preview" hidden></div>
        </section>
      </div>
    </div>
  `;
}

function sectionHeader(number, title) {
  return `<div class="dtd-section-title"><span>${number}</span>${title}</div>`;
}

function productionRefValue(p) {
  return JSON.stringify({ firebaseId: p.firebaseId || '', no: p.no || '' });
}

function productionYearOptionsHtml() {
  const current = new Date().getFullYear();
  const selected = Number(productionFilterYear || current);
  const years = new Set([selected, current + 1, current, current - 1, current - 2, current - 3]);
  productionOptionsCache.forEach(row => {
    const y = Number(row.year || String(row.date || '').slice(0, 4));
    if (Number.isFinite(y)) years.add(y);
  });
  return [...years].sort((a,b)=>b-a)
    .map(year => `<option value="${year}" ${year===selected?'selected':''}>พ.ศ. ${year+543}</option>`)
    .join('');
}

function productionRefOptionsHtml() {
  return productionOptionsCache
    .filter(p => !state.branch || p.branch === state.branch)
    .filter(p => Number(p.year || String(p.date || '').slice(0,4)) === Number(productionFilterYear))
    .filter(p => productionFilterMonth === '' || Number(p.monthIndex ?? p.month ?? (Number(String(p.date || '').slice(5,7))-1)) === Number(productionFilterMonth))
    .filter(p => !productionFilterSearch || [p.no,p.customer,p.job,(p.items||[]).map(i=>i.product).join(' ')].join(' ').toLowerCase().includes(productionFilterSearch.toLowerCase()))
    .map(p => {
      const linked = Boolean(p.invoiceNo);
      const label = `${p.no || '(ไม่มีเลขที่)'} | ${p.customer || '-'} | ${p.job || '-'}${linked ? ` | ✅ ออกบิลแล้ว ${p.invoiceNo}` : ' | ⏳ ยังไม่ออกบิล'}`;
      const value = productionRefValue(p);
      const selected = state.sourceProductionNo && p.no === state.sourceProductionNo ? 'selected' : '';
      return `<option value='${escapeHtml(value)}' ${linked ? 'disabled' : ''} ${selected}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

async function loadProductionOptions() {
  const service = window.FirebaseService;
  if (!service?.loadCollectionByYear) return;
  const { year } = resolveStoragePeriod(state.date);
  productionFilterYear = Number(productionFilterYear || year);
  const cacheKey = `${state.branch}|${productionFilterYear}`;
  if (productionOptionsLoadedKey === cacheKey) return;
  try {
    const rows = await service.loadCollectionByYear('productions', productionFilterYear);
    productionOptionsCache = Array.isArray(rows) ? rows : [];
    productionOptionsLoadedKey = cacheKey;
    const select = document.getElementById('dtd-production-ref');
    if (select) {
      const current = select.value;
      select.innerHTML = `<option value="">-- ไม่ใช้ข้อมูลจากใบสั่งผลิต --</option>${productionRefOptionsHtml()}`;
      if ([...select.options].some(o => o.value === current)) select.value = current;
    }
  } catch (error) {
    console.error('โหลดรายการใบสั่งผลิตไม่สำเร็จ', error);
  }
}

function applyProductionRef(value) {
  if (!value) return;
  let ref;
  try { ref = JSON.parse(value); } catch (_) { return; }
  const p = productionOptionsCache.find(x => (x.firebaseId && x.firebaseId === ref.firebaseId) || (x.no && x.no === ref.no));
  if (!p) { notify('ไม่พบข้อมูลใบสั่งผลิตนี้ อาจถูกลบหรืออัปเดตไปแล้ว'); return; }
  if (p.invoiceNo) { notify(`ใบสั่งผลิตนี้ออกบิลไปแล้ว (เลขที่ ${p.invoiceNo})`); return; }
  state.customerName = p.customer || state.customerName;
  state.sourceProductionNo = p.no || '';
  state.sourceProductionFirebaseId = p.firebaseId || '';
  if (Array.isArray(p.items) && p.items.length) {
    state.items = p.items.map(it => ({
      productCode: '',
      product: it.product || '',
      unit: it.unit || 'ชิ้น',
      qty: Number(it.qty) || 1,
      priceUnit: Number(it.priceUnit) || 0
    }));
  }
  persistDraft();
  renderAppShell();
  bindEvents();
  renderAll();
}

function loadFromInvoice(inv = {}, ref = {}) {
  state.previewOnly = Boolean(ref.previewOnly);
  const branch = ref.b || inv.branch || state.branch || 'khonkaen';
  if (BRANCH_DEFAULTS[branch]) {
    state.branch = branch;
    state.company = { ...branchCompany(branch) };
  }
  state.customerName = inv.customer || '';
  state.docNo = inv.no || state.docNo;
  state.date = inv.date || state.date;
  state.dueDate = inv.dueDate || state.dueDate;
  state.salesperson = inv.salesPerson || '';
  state.vatEnabled = Number(inv.useVat || 0) === 1;
  state.note = inv.note || '';
  state.attachments = Array.isArray(inv.attachments) ? inv.attachments.map(item => ({ ...item })) : [];
  state.sourceProductionNo = inv.sourceProductionNo || '';
  state.sourceProductionFirebaseId = inv.sourceProductionFirebaseId || '';
  state.sourceQuoteNo = inv.sourceQuoteNo || '';
  state.sourceInvoiceNo = inv.no || ref.no || '';
  state.sourceInvoiceId = inv.id || ref.id || '';
  state.sourceInvoiceFirebaseId = inv.firebaseId || '';
  state.sourceInvoiceBranch = branch;
  state.sourceInvoiceYear = ref.y ?? inv.year ?? '';
  state.sourceInvoiceMonth = ref.m ?? inv.month ?? '';
  const items = Array.isArray(inv.items) ? inv.items : [];
  state.items = items.length ? items.slice(0, MAX_ITEMS).map(it => ({
    productCode: it.productCode || '',
    product: it.product || '',
    unit: it.unit || 'ชิ้น',
    qty: Number(it.qty) || 1,
    priceUnit: Number(it.priceUnit ?? it.saleValue) || 0
  })) : [createItem()];
  persistDraft();
  renderAppShell();
  bindEvents();
  renderAll();
  applyLockedBranch();
  loadProductionOptions();
  setTimeout(() => document.getElementById('delivery-tax-app')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
}

function customerSectionHtml() {
  return `
    <div class="dtd-form-section">
      ${sectionHeader(1, 'ข้อมูลลูกค้า')}
      <div class="dtd-production-ref-box dtd-linked-selector">
        <div class="dtd-linked-selector-head"><div><label for="dtd-production-ref">ดึงข้อมูลจากใบสั่งผลิต (ถ้ามี)</label><small>กรองตามสาขาที่เลือก พร้อมเลือกปีและเดือนเพื่อลดความสับสน</small></div><span class="dtd-linked-branch-badge">${escapeHtml(BRANCH_DEFAULTS[state.branch]?.label || 'กรุณาเลือกสาขา')}</span></div>
        <div class="dtd-linked-filter-row">
          <label><span>ปี</span><select id="dtd-production-filter-year">${productionYearOptionsHtml()}</select></label>
          <label><span>เดือน</span><select id="dtd-production-filter-month"><option value="">ทุกเดือน</option>${Array.from({length:12},(_,i)=>`<option value="${i}" ${String(productionFilterMonth)===String(i)?'selected':''}>${i+1}</option>`).join('')}</select></label>
          <label class="dtd-linked-search"><span>ค้นหา</span><input id="dtd-production-filter-search" type="search" value="${escapeHtml(productionFilterSearch)}" placeholder="เลขที่ / ลูกค้า / งาน / สินค้า"></label>
          <button type="button" class="dtd-btn" data-action="refresh-production-link">รีเฟรช</button>
        </div>
        <select id="dtd-production-ref">
          <option value="">-- ไม่ใช้ข้อมูลจากใบสั่งผลิต --</option>
          ${productionRefOptionsHtml()}
        </select>
        <small>${state.sourceProductionNo ? `เชื่อมกับใบสั่งผลิต ${escapeHtml(state.sourceProductionNo)} — เลือกรายการนี้จะดึงชื่อลูกค้าและรายการสินค้ามาเติมให้อัตโนมัติ` : 'เลือกใบสั่งผลิตเพื่อดึงชื่อลูกค้าและรายการสินค้ามาเติมให้อัตโนมัติ (ไม่ดึงที่อยู่ เนื่องจากใบสั่งผลิตไม่มีข้อมูลที่อยู่)'}</small>
      </div>
      <div class="dtd-grid dtd-grid-3">
        ${inputHtml('customerName', 'ชื่อลูกค้า', 'ชื่อบริษัท / ลูกค้า', 'dtd-span-2')}
        ${inputHtml('contact', 'ผู้ติดต่อ', 'ชื่อผู้ติดต่อ')}
        ${textareaHtml('customerAddress', 'ที่อยู่', 'ที่อยู่สำหรับออกเอกสาร', 'dtd-span-2')}
        ${inputHtml('phone', 'เบอร์โทร', '000-000-0000')}
        ${inputHtml('customerTaxId', 'เลขประจำตัวผู้เสียภาษี', '0000000000000')}
      </div>
    </div>
  `;
}

function documentSectionHtml() {
  const locked = getLockedBranch();
  return `
    <div class="dtd-form-section">
      ${sectionHeader(2, 'ข้อมูลเอกสาร')}
      <div class="dtd-grid dtd-grid-4">
        <div class="dtd-field dtd-span-2">
          <span>เลือกสาขา *</span>
          <div class="dtd-branch-options" role="group" aria-label="เลือกสาขาสำหรับออกเอกสาร">
            <button type="button" class="dtd-branch-option ${state.branch === 'ubon' ? 'active' : ''}" data-action="set-branch" data-branch="ubon" ${locked && locked !== 'ubon' ? 'disabled' : ''}>
              <span class="dtd-branch-dot ub"></span><b>สาขาสำนักงานใหญ่</b><small>HEAD OFFICE</small>
            </button>
            <button type="button" class="dtd-branch-option ${state.branch === 'khonkaen' ? 'active' : ''}" data-action="set-branch" data-branch="khonkaen" ${locked && locked !== 'khonkaen' ? 'disabled' : ''}>
              <span class="dtd-branch-dot kk"></span><b>สาขาที่ 00001</b><small>BRANCH 00001</small>
            </button>
          </div>
          ${locked ? `<small class="dtd-branch-lock-note">บัญชีนี้ถูกกำหนดให้ใช้งาน ${escapeHtml(BRANCH_DEFAULTS[locked]?.label || locked)}</small>` : '<small class="dtd-branch-lock-note">Admin สามารถเลือกสาขาก่อนออกเอกสารได้</small>'}
        </div>
        ${inputHtml('docNo', 'เลขที่/No. *', 'INV-0001')}
        <div class="dtd-grid-line-break" aria-hidden="true"></div>
        ${optionalDateInputHtml('date', 'วันที่')}
        ${optionalDateInputHtml('dueDate', 'วันครบกำหนด')}
        ${inputHtml('customerCode', 'รหัสลูกค้า', 'เช่น 012')}
        ${inputHtml('poNo', 'P/O No.', 'เลขที่ใบสั่งซื้อ')}
        ${inputHtml('doNo', 'D/O No.', 'เลขที่ใบส่งสินค้า')}
        ${inputHtml('salesperson', 'พนักงานขาย', 'ชื่อพนักงานขาย')}
        <label class="dtd-field">
          <span>เงื่อนไขการชำระเงิน</span>
          <select data-field="paymentTerm">
            ${['เงินสด', 'เครดิต 7 วัน', 'เครดิต 15 วัน', 'เครดิต 30 วัน', 'เครดิต 45 วัน', 'เครดิต 60 วัน'].map(v => `<option ${state.paymentTerm === v ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </label>
        ${inputHtml('shipTo', 'สถานที่ส่งของ', 'สถานที่จัดส่ง', 'dtd-span-2')}
        ${inputHtml('buyerName', 'ชื่อผู้สั่งซื้อ', 'ชื่อผู้สั่งซื้อ')}
      </div>
      <details class="dtd-company-settings">
        <summary>ตั้งค่าข้อมูลหัวเอกสารของสาขา</summary>
        <div class="dtd-grid dtd-grid-2">
          ${inputHtml('company.companyNameTh', 'ชื่อบริษัทภาษาไทย', '', 'dtd-span-2')}
          ${inputHtml('company.companyNameEn', 'ชื่อบริษัทภาษาอังกฤษ', '', 'dtd-span-2')}
          ${textareaHtml('company.addressTh', 'ที่อยู่ภาษาไทย', '', 'dtd-span-2')}
          ${inputHtml('company.addressEn', 'ที่อยู่ภาษาอังกฤษ', '', 'dtd-span-2')}
          ${inputHtml('company.phone', 'เบอร์โทรบริษัท', '000-000-0000')}
          ${inputHtml('company.taxId', 'เลขประจำตัวผู้เสียภาษีบริษัท', '0000000000000')}
        </div>
      </details>
    </div>
  `;
}

function itemsSectionHtml() {
  return `
    <div class="dtd-form-section">
      ${sectionHeader(3, 'รายการสินค้า')}
      <div class="dtd-items-wrap">
        <table class="dtd-items-editor">
          <thead>
            <tr><th>#</th><th>รหัสสินค้า</th><th>รายการ</th><th>หน่วยนับ</th><th>จำนวน</th><th>ราคาต่อหน่วย</th><th>จำนวนเงิน</th><th></th></tr>
          </thead>
          <tbody id="dtd-items-editor-body"></tbody>
        </table>
      </div>
      <button type="button" class="dtd-add-item" data-action="add-item">＋ เพิ่มรายการ</button>
      <div class="dtd-item-limit">เพิ่มได้สูงสุด ${MAX_ITEMS} รายการ • ช่องรายละเอียดรองรับหลายบรรทัด • ระบบจะแบ่งหน้า PDF ต่อเนื่องให้อัตโนมัติ</div>
    </div>
  `;
}

function summarySectionHtml() {
  return `
    <div class="dtd-form-section">
      ${sectionHeader(4, 'สรุปยอด')}
      <div class="dtd-summary-grid">
        <label class="dtd-field">
          <span>ภาษีมูลค่าเพิ่ม</span>
          <select data-field="vatEnabled">
            <option value="1" ${state.vatEnabled ? 'selected' : ''}>รวม VAT 7%</option>
            <option value="0" ${!state.vatEnabled ? 'selected' : ''}>ไม่รวม VAT 7%</option>
          </select>
          <small class="dtd-vat-help">รวม VAT 7% = รวมมูลค่าสินค้า + VAT 7% • ไม่รวม VAT 7% = ถอดฐานภาษีด้วย รวมมูลค่าสินค้า × 100 ÷ 107 แล้วบวก VAT 7%</small>
        </label>
        <div class="dtd-summary-box"><span>รวมมูลค่าสินค้า</span><strong id="dtd-subtotal">0.00</strong><em>บาท</em></div>
        <div class="dtd-summary-box"><span>ภาษีมูลค่าเพิ่ม (7%)</span><strong id="dtd-vat">0.00</strong><em>บาท</em></div>
        <div class="dtd-summary-box dtd-summary-grand"><span>ยอดรวมทั้งสิ้น</span><strong id="dtd-grand">0.00</strong><em>บาท</em></div>
      </div>
      <label class="dtd-field dtd-full-field"><span>จำนวนเงินเป็นตัวอักษร</span><input id="dtd-baht-text" readonly></label>
      ${inputHtml('note', 'หมายเหตุ', 'ข้อความเพิ่มเติมในเอกสาร', 'dtd-full-field')}
    </div>
  `;
}

function sourceEvidenceHtml() {
  const files = Array.isArray(state.attachments) ? state.attachments : [];
  const cards = files.map(file => {
    const name = file.originalName || file.name || 'ไฟล์แนบ';
    const type = file.type || file.mimeType || '';
    const imageSrc = type.startsWith('image/') ? (file.previewUrl || file.data || '') : '';
    const driveLink = file.webViewLink || '';
    return `<div class="dtd-source-evidence-item">
      ${imageSrc ? `<img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(name)}">` : `<div class="dtd-source-evidence-icon">${type.includes('pdf') ? 'PDF' : '📎'}</div>`}
      <div class="dtd-source-evidence-name">${escapeHtml(name)}</div>
      ${driveLink ? `<a href="${escapeHtml(driveLink)}" target="_blank" rel="noopener">เปิดหลักฐาน</a>` : '<small>หลักฐานจากข้อมูลต้นทาง</small>'}
    </div>`;
  }).join('');
  return `<div class="dtd-form-section dtd-source-evidence-section">
    ${sectionHeader(5, 'หลักฐานที่แนบมากับใบส่งสินค้า')}
    ${files.length ? `<div class="dtd-source-evidence-grid">${cards}</div>` : '<div class="dtd-source-evidence-empty">ยังไม่มีรูปภาพหรือ PDF หลักฐานในข้อมูลต้นทาง</div>'}
  </div>`;
}

function templateUploadHtml() {
  return `
    <div class="dtd-form-section">
      ${sectionHeader(6, 'แนบเอกสารต้นแบบ')}
      <label class="dtd-template-upload">
        <input type="file" id="dtd-template-file" accept="application/pdf,.pdf">
        <span class="dtd-upload-icon">☁</span>
        <strong>อัปโหลด PDF ต้นแบบ</strong>
        <small>ลากไฟล์ PDF มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</small>
        <small>ไฟล์นี้ใช้เปิดดูเป็นเอกสารอ้างอิง ส่วน PDF ที่ระบบสร้างจะใช้แบบฟอร์ม 3 หน้าด้านขวา</small>
      </label>
      <div id="dtd-template-status" class="dtd-template-status"></div>
    </div>
  `;
}

function optionalDateInputHtml(field, label) {
  const value = escapeHtml(getNestedValue(state, field));
  return `
    <label class="dtd-field dtd-optional-date-field">
      <span>${label} <small>(ไม่บังคับ)</small></span>
      <div class="dtd-optional-date-control">
        <input type="date" data-field="${field}" value="${value}">
        <button type="button" class="dtd-clear-date" data-action="clear-date" data-field-target="${field}">ไม่ระบุวันที่</button>
      </div>
      <small class="dtd-optional-date-hint">เลือกวันที่ได้ หรือกด “ไม่ระบุวันที่” เพื่อเว้นว่างในเอกสาร</small>
    </label>
  `;
}

function inputHtml(field, label, placeholder = '', className = '', type = 'text') {
  return `
    <label class="dtd-field ${className}">
      <span>${label}</span>
      <input type="${type}" data-field="${field}" value="${escapeHtml(getNestedValue(state, field))}" placeholder="${escapeHtml(placeholder)}">
    </label>
  `;
}

function textareaHtml(field, label, placeholder = '', className = '') {
  return `
    <label class="dtd-field ${className}">
      <span>${label}</span>
      <textarea data-field="${field}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(getNestedValue(state, field))}</textarea>
    </label>
  `;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((cur, key) => cur?.[key], obj) ?? '';
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  keys.slice(0, -1).forEach(key => {
    if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key];
  });
  cur[keys[keys.length - 1]] = value;
}

function bindEvents() {
  const root = document.getElementById('delivery-tax-app');
  if (!root || root.dataset.bound === '1') return;
  root.dataset.bound = '1';

  root.addEventListener('input', event => {
    const field = event.target?.dataset?.field;
    if (!field) return;
    const value = field === 'vatEnabled' ? event.target.value === '1' : event.target.value;
    setNestedValue(state, field, value);
    persistDraft();
    updateComputedAndPreview();
  });

  root.addEventListener('change', event => {
    const field = event.target?.dataset?.field;
    if (field === 'branch') {
      const branch = event.target.value;
      state.branch = branch;
      state.company = { ...branchCompany(branch) };
      persistDraft();
      renderAppShell();
      bindEvents();
      renderAll();
      applyLockedBranch();
      return;
    }
    if (field) {
      const value = field === 'vatEnabled' ? event.target.value === '1' : event.target.value;
      setNestedValue(state, field, value);
      persistDraft();
      updateComputedAndPreview();
    }
  });

  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'refresh-production-link') { productionOptionsLoadedKey=''; await loadProductionOptions(); return; }
    if (action === 'set-branch') setBranch(button.dataset.branch);
    if (action === 'clear-date') clearOptionalDate(button.dataset.fieldTarget);
    if (action === 'add-item') addItem();
    if (action === 'remove-item') removeItem(Number(button.dataset.index));
    if (action === 'back-source') {
      window.go?.('invoice-form', document.querySelector('.nav-item[onclick*="invoice-form"]'));
      return;
    }
    if (action === 'save') await saveDocumentToSystem(button);
    if (action === 'print-current') printDocuments('current');
    if (action === 'print-set') printDocuments('all');
    if (action === 'pdf-current') await downloadPdf(button, 'current');
    if (action === 'pdf-set') await downloadPdf(button, 'all');
    if (action === 'show-template') showUploadedTemplate();
  });

  root.addEventListener('input', event => {
    if (event.target.id === 'dtd-production-filter-search') { productionFilterSearch=event.target.value||''; const sel=document.getElementById('dtd-production-ref'); if(sel)sel.innerHTML=`<option value="">-- ไม่ใช้ข้อมูลจากใบสั่งผลิต --</option>${productionRefOptionsHtml()}`; return; }
    if (!event.target.matches('[data-item-field]')) return;
    const index = Number(event.target.dataset.index);
    const field = event.target.dataset.itemField;
    const numeric = ['qty', 'priceUnit'].includes(field);
    state.items[index][field] = numeric ? parseMoney(event.target.value) : event.target.value;
    persistDraft();
    updateItemAmount(index);
    updateComputedAndPreview();
  });

  root.addEventListener('change', event => {
    if (event.target.id === 'dtd-template-file') handleTemplateUpload(event.target.files?.[0]);
    if (event.target.id === 'dtd-production-ref') applyProductionRef(event.target.value);
    if (event.target.id === 'dtd-production-filter-year') { productionFilterYear=Number(event.target.value)||new Date().getFullYear(); productionOptionsLoadedKey=''; loadProductionOptions(); }
    if (event.target.id === 'dtd-production-filter-month') { productionFilterMonth=event.target.value; const sel=document.getElementById('dtd-production-ref'); if(sel)sel.innerHTML=`<option value="">-- ไม่ใช้ข้อมูลจากใบสั่งผลิต --</option>${productionRefOptionsHtml()}`; }
    if (event.target.id === 'dtd-production-filter-search') { productionFilterSearch=event.target.value||''; const sel=document.getElementById('dtd-production-ref'); if(sel)sel.innerHTML=`<option value="">-- ไม่ใช้ข้อมูลจากใบสั่งผลิต --</option>${productionRefOptionsHtml()}`; }
  });
}

function clearOptionalDate(field) {
  if (!['date', 'dueDate'].includes(field)) return;
  setNestedValue(state, field, '');
  const input = document.querySelector('#delivery-tax-app [data-field="' + field + '"]');
  if (input) input.value = '';
  persistDraft();
  updateComputedAndPreview();
}

function setBranch(branch) {
  const locked = getLockedBranch();
  if (!BRANCH_DEFAULTS[branch]) return;
  if (locked && locked !== branch) {
    notify(`บัญชีนี้ถูกกำหนดให้ใช้งาน ${BRANCH_DEFAULTS[locked]?.label || locked} เท่านั้น`);
    return;
  }
  if (state.branch === branch) return;
  state.branch = branch;
  state.company = { ...branchCompany(branch) };
  persistDraft();
  renderAppShell();
  bindEvents();
  renderAll();
  applyLockedBranch();
  loadProductionOptions();
}

function applyLockedBranch() {
  const locked = getLockedBranch();
  if (!locked) return;
  if (state.branch !== locked) {
    state.branch = locked;
    state.company = { ...branchCompany(locked) };
    persistDraft();
    renderAppShell();
    bindEvents();
    renderAll();
    loadProductionOptions();
  }
}

function renderAll() {
  renderItemsEditor();
  renderTabs();
  updateComputedAndPreview();
}

const STANDARD_ITEM_UNITS = ['ชิ้น', 'กล่อง', 'ชุด', 'เครื่อง', 'ดวง', 'ม้วน', 'ตลับ', 'อัน', 'แผ่น', 'ขวด', 'ถุง', 'เล่ม', 'ซอง', 'อื่น ๆ'];

function itemUnitOptionsHtml(selected = 'ชิ้น') {
  // รองรับข้อมูลเก่าที่เคยพิมพ์หน่วยอื่นไว้เป็นข้อความอิสระ ไม่ให้ค่าหายตอนเปิดดู
  const units = STANDARD_ITEM_UNITS.includes(selected) || !selected ? STANDARD_ITEM_UNITS : [selected, ...STANDARD_ITEM_UNITS];
  return units.map(u => `<option value="${escapeHtml(u)}" ${u === selected ? 'selected' : ''}>${escapeHtml(u)}</option>`).join('');
}

function renderItemsEditor() {
  const body = document.getElementById('dtd-items-editor-body');
  if (!body) return;
  body.innerHTML = state.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><input data-item-field="productCode" data-index="${index}" value="${escapeHtml(item.productCode)}" placeholder="รหัส"></td>
      <td><textarea rows="2" data-item-field="product" data-index="${index}" placeholder="ชื่อสินค้า / รายละเอียด (พิมพ์หลายบรรทัดได้)">${escapeHtml(item.product)}</textarea></td>
      <td><select data-item-field="unit" data-index="${index}">${itemUnitOptionsHtml(item.unit)}</select></td>
      <td><input type="number" min="0" step="0.01" data-item-field="qty" data-index="${index}" value="${item.qty}"></td>
      <td><input type="number" min="0" step="0.01" data-item-field="priceUnit" data-index="${index}" value="${item.priceUnit}"></td>
      <td class="dtd-item-amount" id="dtd-item-amount-${index}">${fmt(parseMoney(item.qty) * parseMoney(item.priceUnit))}</td>
      <td><button type="button" class="dtd-remove-item" data-action="remove-item" data-index="${index}" title="ลบรายการ">🗑</button></td>
    </tr>
  `).join('');
}

function updateItemAmount(index) {
  const cell = document.getElementById(`dtd-item-amount-${index}`);
  if (cell) cell.textContent = fmt(parseMoney(state.items[index]?.qty) * parseMoney(state.items[index]?.priceUnit));
}

function addItem() {
  if (state.items.length >= MAX_ITEMS) {
    notify(`เอกสารหนึ่งชุดเพิ่มได้สูงสุด ${MAX_ITEMS} รายการ`);
    return;
  }
  state.items.push(createItem());
  persistDraft();
  renderItemsEditor();
  updateComputedAndPreview();
}

function removeItem(index) {
  if (state.items.length === 1) {
    state.items[0] = createItem();
  } else {
    state.items.splice(index, 1);
  }
  persistDraft();
  renderItemsEditor();
  updateComputedAndPreview();
}

function renderTabs() {
  const tabs = document.getElementById('dtd-preview-tabs');
  if (!tabs) return;
  tabs.innerHTML = PAGE_TYPES.map(page => `
    <button type="button" class="${activePage === page.id ? 'active' : ''}" data-page="${page.id}">${page.tab}</button>
  `).join('');
  tabs.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
      activePage = button.dataset.page;
      renderTabs();
      renderPreview();
    });
  });
}

function updateComputedAndPreview() {
  const sum = totals();
  const subtotal = document.getElementById('dtd-subtotal');
  const vat = document.getElementById('dtd-vat');
  const grand = document.getElementById('dtd-grand');
  const words = document.getElementById('dtd-baht-text');
  if (subtotal) subtotal.textContent = fmt(sum.subtotal);
  if (vat) vat.textContent = fmt(sum.vat);
  if (grand) grand.textContent = fmt(sum.grand);
  if (words) words.value = bahtText(sum.grand);
  renderPreview();
}

function printableItems() {
  const rows = state.items.filter(item => item.product || item.productCode || parseMoney(item.priceUnit) || parseMoney(item.qty));
  return rows.length ? rows : [createItem()];
}

function itemRowUnits(item) {
  const text = `${item?.productCode || ''} ${item?.product || ''}`.trim();
  const explicitLines = String(text || '').split(/\r?\n/);
  const wrappedLines = explicitLines.reduce((total, line) => total + Math.max(1, Math.ceil(String(line).length / 42)), 0);
  return Math.max(1, Math.min(4, wrappedLines));
}

function paginateItems(items = printableItems()) {
  const pages = [];
  let rows = [];
  let usedUnits = 0;
  items.forEach(item => {
    const units = itemRowUnits(item);
    if (rows.length && usedUnits + units > ITEM_UNITS_PER_PAGE) {
      pages.push({ rows, usedUnits });
      rows = [];
      usedUnits = 0;
    }
    rows.push({ item, units });
    usedUnits += units;
  });
  if (rows.length || !pages.length) pages.push({ rows: rows.length ? rows : [{ item: createItem(), units: 1 }], usedUnits: usedUnits || 1 });
  return pages;
}

function documentPagesHtml(pageType, pdfMode = false) {
  const chunks = paginateItems();
  return chunks.map((chunk, index) => documentPageHtml(pageType, pdfMode, {
    chunk,
    pageNumber: index + 1,
    totalPages: chunks.length,
    isFinalPage: index === chunks.length - 1
  })).join('');
}

function renderPreview() {
  const preview = document.getElementById('dtd-live-preview');
  if (!preview) return;
  const page = PAGE_TYPES.find(item => item.id === activePage) || PAGE_TYPES[0];
  preview.innerHTML = documentPagesHtml(page, false);
}

function documentPageHtml(pageType, pdfMode = false, pageInfo = {}) {
  const sum = totals();
  const chunk = pageInfo.chunk || paginateItems()[0];
  const pageNumber = Number(pageInfo.pageNumber || 1);
  const totalPages = Number(pageInfo.totalPages || 1);
  const isFinalPage = pageInfo.isFinalPage !== false;
  const rowHtml = chunk.rows.map(({ item, units }) => `
    <tr class="dtd-data-row" style="height:${(3.15 * units).toFixed(2)}em">
      <td>${escapeHtml(item.productCode)}</td>
      <td class="dtd-doc-desc">${escapeHtml(item.product).replace(/\n/g, '<br>')}</td>
      <td>${escapeHtml(item.unit)}</td>
      <td class="num">${fmt(item.qty)}</td>
      <td class="num">${fmt(item.priceUnit)}</td>
      <td class="num">${fmt(parseMoney(item.qty) * parseMoney(item.priceUnit))}</td>
    </tr>
  `).join('');
  const emptyUnits = Math.max(0, ITEM_UNITS_PER_PAGE - Number(chunk.usedUnits || 0));
  const emptyHtml = Array.from({ length: emptyUnits }, () => '<tr class="empty"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>').join('');
  const company = state.company || branchCompany(state.branch);
  const logoSrc = pdfMode && pdfLogoDataUrl ? pdfLogoDataUrl : COMPANY_LOGO_URL;
  const pageCounter = totalPages > 1 ? `<span class="dtd-doc-page-counter">หน้ารายการ ${pageNumber}/${totalPages}</span>` : '';
  const subtotalText = isFinalPage ? fmt(sum.subtotal) : '';
  const vatText = isFinalPage ? fmt(sum.vat) : '';
  const grandText = isFinalPage ? fmt(sum.grand) : '';
  const bahtTextValue = isFinalPage ? bahtText(sum.grand) : 'มีรายการต่อหน้าถัดไป';

  return `
    <article class="dtd-document-page ${pdfMode ? 'dtd-pdf-page' : ''} ${!isFinalPage ? 'dtd-continuation-page' : ''}" data-page-id="${pageType.id}" data-item-page="${pageNumber}">
      <div class="dtd-doc-topbar">
        <div class="dtd-doc-serial-no"><span>เลขที่/No.</span> <strong>${escapeHtml(state.docNo)}</strong>${pageCounter}</div>
      </div>
      <header class="dtd-doc-header">
        <div class="dtd-doc-company">
          <img src="${logoSrc}" alt="Company Logo" crossorigin="anonymous" decoding="sync">
          <div>
            <div class="dtd-doc-company-th">${escapeHtml(company.companyNameTh)}</div>
            <div class="dtd-doc-company-en">${escapeHtml(company.companyNameEn)}</div>
            <div class="dtd-doc-contact">${escapeHtml(company.addressTh)}</div>
            <div class="dtd-doc-contact">${escapeHtml(company.addressEn)}</div>
            <div class="dtd-doc-contact">${escapeHtml((company.phone || '').trim().startsWith('Tel:') ? company.phone : `Mobile : ${company.phone || ''}`)}</div>
            <div class="dtd-doc-tax">เลขประจำตัวผู้เสียภาษี ${escapeHtml(company.taxId)}</div>
          </div>
        </div>
        <div class="dtd-doc-title">
          <h3>${pageType.tab}</h3>
          <h2>${pageType.titleTh}</h2>
          <div>${pageType.titleEn}</div>
          <h4>${pageType.audience}</h4>
          <small>${pageType.note}</small>
        </div>
      </header>

      <section class="dtd-doc-party-grid">
        <div class="dtd-doc-party-box">
          <div><b>นามลูกค้า/Customer name :</b> ${escapeHtml(state.customerName)}</div>
          <div><b>ที่อยู่/Address :</b><br>${escapeHtml(state.customerAddress).replace(/\n/g, '<br>')}</div>
          <div class="dtd-doc-party-bottom"><b>เลขประจำตัวผู้เสียภาษี</b> ${escapeHtml(state.customerTaxId)}</div>
        </div>
        <div class="dtd-doc-party-box">
          <div><b>สถานที่ส่งของ/Ship to :</b><br>${escapeHtml(state.shipTo).replace(/\n/g, '<br>')}</div>
          <div class="dtd-doc-party-bottom"><b>ชื่อผู้สั่งซื้อ/Buyer Name :</b> ${escapeHtml(state.buyerName || state.contact)}</div>
        </div>
      </section>

      <table class="dtd-doc-meta-table">
        <thead><tr>
          <th>รหัสลูกค้า<br><span>Customer code</span></th>
          <th>ใบสั่งซื้อเลขที่<br><span>P/O. No.</span></th>
          <th>ใบส่งสินค้าเลขที่<br><span>D/O. No.</span></th>
          <th>พนักงานขาย<br><span>Salesman</span></th>
          <th>เงื่อนไขการชำระเงิน<br><span>Payment Term</span></th>
          <th>วันครบกำหนด<br><span>Due Date</span></th>
          <th>วันที่<br><span>Date</span></th>
        </tr></thead>
        <tbody><tr>
          <td>${escapeHtml(state.customerCode)}</td>
          <td>${escapeHtml(state.poNo)}</td>
          <td>${escapeHtml(state.doNo)}</td>
          <td>${escapeHtml(state.salesperson)}</td>
          <td>${escapeHtml(state.paymentTerm)}</td>
          <td>${formatDate(state.dueDate)}</td>
          <td>${formatDate(state.date)}</td>
        </tr></tbody>
      </table>

      <div class="dtd-doc-items-section">
        <table class="dtd-doc-items-table">
          <thead><tr>
            <th>รหัสสินค้า<br><span>Product code</span></th>
            <th>รายการ<br><span>Description</span></th>
            <th>หน่วยนับ<br><span>Unit</span></th>
            <th>จำนวน<br><span>Quantity</span></th>
            <th>ราคาต่อหน่วย<br><span>Unit Price</span></th>
            <th>จำนวนเงิน<br><span>Amount</span></th>
          </tr></thead>
          <tbody>${rowHtml}${emptyHtml}</tbody>
        </table>
        <img class="dtd-doc-watermark" src="${logoSrc}" alt="" crossorigin="anonymous" decoding="sync">
        <div class="dtd-doc-bottom-area">
          <div class="dtd-doc-payment-note">
            <div>โปรดชำระเงินเข้าบัญชีของบริษัท <b>${escapeHtml(company.companyNameTh || window.CurrentUser?.tenantName || 'บริษัท')}</b></div>
            <div>• สินค้าตามรายการข้างต้นยังเป็นกรรมสิทธิ์ของบริษัทฯ จนกว่าจะได้รับชำระเงินครบถ้วน</div>
            ${state.note ? `<div>หมายเหตุ: ${escapeHtml(state.note)}</div>` : ''}
            ${!isFinalPage ? `<div class="dtd-doc-next-page-note">รายการต่อหน้าถัดไป (${pageNumber + 1}/${totalPages})</div>` : ''}
            <div class="dtd-doc-baht"><b>บาท<br><span>Baht</span></b><strong>${bahtTextValue}</strong></div>
          </div>
          <div class="dtd-doc-totals">
            <div><span>รวมมูลค่าสินค้า<br><em>Total</em></span><strong>${subtotalText}</strong></div>
            <div><span>ภาษีมูลค่าเพิ่ม 7%<br><em>VAT 7%</em></span><strong>${vatText}</strong></div>
            <div><span>ยอดรวม<br><em>Grand Total</em></span><strong>${grandText}</strong></div>
          </div>
        </div>
      </div>

      <div class="dtd-doc-terms">
        <div class="dtd-doc-terms-copy">
          <div>หากมีข้อผิดพลาดใด ๆ ของสินค้าหรือเอกสาร โปรดแจ้งภายใน 7 วัน นับจากวันที่ส่งสินค้า มิฉะนั้นทางบริษัทฯ จะไม่รับผิดชอบ</div>
          <div>กรณีชำระเงินเกินกำหนด บริษัทฯ ขอสงวนสิทธิ์คิดดอกเบี้ยในอัตรา 2% ต่อเดือน นับจากวันที่ครบกำหนด</div>
        </div>
        <div class="dtd-doc-officer-label">สำหรับเจ้าหน้าที่/<span>For officer</span></div>
      </div>

      <section class="dtd-doc-signatures">
        ${signatureBox(
          'สำหรับลูกค้า',
          'Customer',
          pageType.id === 'original'
            ? 'ได้รับสินค้าตามรายการข้างต้นไว้เรียบร้อยแล้วพร้อมต้นฉบับใบกำกับภาษี'
            : 'ได้รับสินค้าตามรายการข้างต้นไว้เรียบร้อยแล้วพร้อมสำเนาใบกำกับภาษี',
          'ผู้รับสินค้า/Receiver',
          'วันที่/Date',
          true
        )}
        ${signatureBox('ผู้อนุมัติ', 'Authorized signature')}
        ${signatureBox('ผู้ออกเอกสาร', 'Prepared By')}
        ${signatureBox('พนักงานขาย', 'Salesman')}
        ${signatureBox('ผู้จัดส่ง', 'Deliverer')}
      </section>
    </article>
  `;
}

function signatureBox(th, en, note = '', footerLeft = '', footerRight = '', customerBox = false) {
  return `
    <div class="dtd-doc-sign-box ${customerBox ? 'dtd-doc-sign-customer' : ''}">
      <div class="dtd-doc-sign-head"><b>${th}</b><span>${en}</span></div>
      <div class="dtd-doc-sign-body">
        ${note ? `<small>${note}</small>` : '<small>&nbsp;</small>'}
        ${customerBox ? `
          <div class="dtd-customer-sign-row">
            <span class="dtd-customer-write-line" aria-hidden="true"></span>
            <span class="dtd-customer-sign-label">${footerLeft || 'ผู้รับสินค้า/Receiver'}</span>
            <span class="dtd-customer-date-line">__/__/__</span>
            <span class="dtd-customer-date-label">${footerRight || 'วันที่/Date'}</span>
          </div>` : `
          <div class="dtd-doc-sign-line">........................................</div>
          <div class="dtd-doc-sign-date">........../........../..........</div>
          ${(footerLeft || footerRight) ? `
            <div class="dtd-doc-sign-footer">
              <span>${footerLeft}</span>
              <span>${footerRight}</span>
            </div>` : ''}
        `}
      </div>
    </div>
  `;
}

function resolveStoragePeriod(dateValue) {
  const match = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    if (Number.isFinite(year) && month >= 0 && month <= 11) return { year, month };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function validateBeforeSave() {
  if (!state.branch) return 'กรุณาเลือกสาขา';
  if (!state.docNo.trim()) return 'กรุณากรอกเลขที่เอกสาร';
  if (!state.customerName.trim()) return 'กรุณากรอกชื่อลูกค้า';
  const validItems = state.items.filter(item => String(item.product || '').trim() && parseMoney(item.qty) > 0);
  if (!validItems.length) return 'กรุณากรอกรายการสินค้าอย่างน้อย 1 รายการ';
  return '';
}

async function saveDocumentToSystem(button) {
  if (state.previewOnly) { notify('นี่คือตัวอย่างจากข้อมูลที่ยังไม่ได้บันทึก กรุณากลับไปบันทึกใบส่งสินค้า / ใบกำกับภาษีก่อนบันทึกเอกสารออกจริง'); return; }
  const error = validateBeforeSave();
  if (error) {
    notify(error);
    return;
  }
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'กำลังบันทึก...';
  try {
    // วันที่บนเอกสารเป็นข้อมูลไม่บังคับ แต่ระบบยังต้องมีปี/เดือนสำหรับจัดเก็บและซิงก์
    // หากไม่ระบุวันที่ จะใช้เดือนปัจจุบันเป็นตำแหน่งจัดเก็บ โดยช่องวันที่ในเอกสารยังคงว่าง
    const { year, month } = resolveStoragePeriod(state.date);
    const key = businessStorageKey(state.branch, year, month);
    const pack = JSON.parse(localStorage.getItem(key) || '{"quotes":[],"invoices":[],"receipts":[],"issuedInvoices":[],"issuedReceipts":[],"expenses":[],"productions":[]}');
    pack.issuedInvoices ||= [];
    const sum = totals();
    const existingIndex = pack.issuedInvoices.findIndex(inv => String(inv.no) === String(state.docNo) && String(inv.date) === String(state.date));
    const old = existingIndex >= 0 ? pack.issuedInvoices[existingIndex] : null;
    const record = {
      ...(old || {}),
      id: old?.id || Date.now(),
      no: state.docNo,
      date: state.date || '',
      dueDate: state.dueDate || '',
      dateSpecified: Boolean(state.date),
      dueDateSpecified: Boolean(state.dueDate),
      customer: state.customerName,
      ...(window.customerAgencyForRecord ? window.customerAgencyForRecord({ customer: state.customerName }) : {}),
      salesPerson: state.salesperson,
      items: state.items.filter(item => String(item.product || '').trim() || String(item.productCode || '').trim()).map(item => ({
        productCode: item.productCode,
        product: item.product,
        unit: item.unit,
        qty: parseMoney(item.qty),
        priceUnit: parseMoney(item.priceUnit),
        saleTotal: parseMoney(item.qty) * parseMoney(item.priceUnit),
        costUnit: 0,
        costTotal: 0
      })),
      itemSaleTotal: sum.itemTotal,
      subtotal: sum.subtotal,
      useVat: state.vatEnabled ? 1 : 0,
      vatMode: state.vatEnabled ? 'add' : 'extract',
      vatAmt: sum.vat,
      total: sum.grand,
      saleTotal: sum.itemTotal,
      costTotal: 0,
      commMode: 'manual',
      commRate: 0,
      commAmt: 0,
      profit: sum.subtotal,
      paymentStatus: old?.paymentStatus || 'pending',
      paid: old?.paid || false,
      isPaid: old?.isPaid || false,
      paidAt: old?.paidAt || '',
      paidBy: old?.paidBy || '',
      note: state.note,
      sourceProductionNo: state.sourceProductionNo || '',
      sourceQuoteNo: state.sourceQuoteNo || '',
      sourceInvoiceNo: state.sourceInvoiceNo || state.docNo || '',
      sourceInvoiceId: state.sourceInvoiceId || '',
      sourceInvoiceFirebaseId: state.sourceInvoiceFirebaseId || '',
      attachments: state.attachments?.length ? state.attachments : (old?.attachments || []),
      branch: state.branch,
      year,
      month,
      documentKind: 'delivery-tax-invoice',
      documentData: JSON.parse(JSON.stringify(state))
    };

    if (existingIndex >= 0) pack.issuedInvoices[existingIndex] = record;
    else pack.issuedInvoices.push(record);
    localStorage.setItem(key, JSON.stringify(pack));

    // เมื่อเอกสารนี้ถูกเปิดจากฟอร์มใบส่งสินค้าเดิม ให้บันทึกสถานะกลับไปยังรายการต้นทาง
    // เพื่อให้หน้าเดียวกันทำหน้าที่ทั้งเก็บข้อมูลธุรกิจและพิมพ์เอกสาร โดยไม่ต้องมีเมนูซ้ำ
    if (state.sourceInvoiceNo && state.sourceInvoiceBranch && state.sourceInvoiceYear !== '' && state.sourceInvoiceMonth !== '') {
      try {
        const sourceKey = businessStorageKey(state.sourceInvoiceBranch, Number(state.sourceInvoiceYear), Number(state.sourceInvoiceMonth));
        const sourcePack = JSON.parse(localStorage.getItem(sourceKey) || '{}');
        const sourceInv = (sourcePack.invoices || []).find(row => String(row.id) === String(state.sourceInvoiceId) || String(row.no) === String(state.sourceInvoiceNo));
        if (sourceInv) {
          sourceInv.issuedDocumentNo = state.docNo;
          sourceInv.issuedDocumentId = record.id;
          sourceInv.issuedDocumentStatus = 'issued';
          sourceInv.issuedDocumentUpdatedAt = new Date().toISOString();
          localStorage.setItem(sourceKey, JSON.stringify(sourcePack));
        }
      } catch (linkError) {
        console.warn('เชื่อมสถานะเอกสารกลับไปยังใบส่งสินค้าเดิมไม่สำเร็จ', linkError);
      }
    }

    let cloudError = null;
    const service = window.FirebaseService;
    if (service) {
      try {
        if (old && service.updateBusinessDoc) {
          await service.updateBusinessDoc('issuedInvoices', record.id, state.branch, year, month, record, old.firebaseId || '');
        } else if (!old && service.saveIssuedInvoice) {
          const ref = await service.saveIssuedInvoice(record);
          if (ref?.id) {
            record.firebaseId = ref.id;
            const refreshed = JSON.parse(localStorage.getItem(key));
            const saved = refreshed.issuedInvoices.find(inv => String(inv.id) === String(record.id));
            if (saved) saved.firebaseId = ref.id;
            localStorage.setItem(key, JSON.stringify(refreshed));
          }
        }
        if (state.sourceInvoiceFirebaseId && service.updateBusinessDoc && state.sourceInvoiceBranch) {
          try {
            await service.updateBusinessDoc('invoices', state.sourceInvoiceId || null, state.sourceInvoiceBranch, Number(state.sourceInvoiceYear), Number(state.sourceInvoiceMonth), {
              issuedDocumentNo: state.docNo,
              issuedDocumentId: record.id,
              issuedDocumentStatus: 'issued',
              issuedDocumentUpdatedAt: new Date().toISOString()
            }, state.sourceInvoiceFirebaseId);
          } catch (linkError) {
            console.error('อัปเดตสถานะเอกสารใบส่งสินค้าต้นทางไม่สำเร็จ', linkError);
          }
        }
        if (state.sourceProductionFirebaseId && service.updateBusinessDoc) {
          try {
            await service.updateBusinessDoc('productions', null, null, null, null, { invoiceNo: state.docNo, invoiceStatus: 'created' }, state.sourceProductionFirebaseId);
            productionOptionsLoadedKey = '';
          } catch (linkError) {
            console.error('อัปเดตสถานะใบสั่งผลิตไม่สำเร็จ', linkError);
          }
        }
      } catch (error) {
        cloudError = error;
        console.error('บันทึกเอกสารขึ้น Firebase ไม่สำเร็จ', error);
      }
    }

    persistDraft();
    window.onYearChange?.(false);
    window.renderDash?.();
    window.renderIssuedInvoiceList?.();
    if (cloudError) {
      notify(`บันทึกเอกสารไว้ในเครื่องแล้ว แต่ยังไม่ขึ้น Firebase/เครื่องอื่น\nสาเหตุ: ${cloudError?.message || cloudError}`);
    } else {
      notify(existingIndex >= 0 ? 'อัปเดตเอกสารในระบบเรียบร้อย' : 'บันทึกใบส่งสินค้า/ใบกำกับภาษีเข้าระบบเรียบร้อย');
    }
  } catch (error) {
    console.error(error);
    notify(`บันทึกเอกสารไม่สำเร็จ: ${error?.message || error}`);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function createOffscreenPages(mode = 'all') {
  const container = document.createElement('div');
  container.className = 'dtd-pdf-stage';
  container.setAttribute('aria-hidden', 'true');
  const selectedPage = PAGE_TYPES.find(page => page.id === activePage) || PAGE_TYPES[0];
  container.innerHTML = mode === 'current' ? documentPagesHtml(selectedPage, true) : PAGE_TYPES.map(page => documentPagesHtml(page, true)).join('');
  document.body.appendChild(container);
  return container;
}

async function waitForPdfStageAssets(stage) {
  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch (_) {}
  const images = [...stage.querySelectorAll('img')];
  await Promise.all(images.map(async image => {
    if (image.complete && image.naturalWidth > 0) return;
    try {
      if (image.decode) await image.decode();
      else await new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    } catch (_) {}
  }));
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function downloadPdf(button, mode = 'all') {
  const error = validateBeforeSave();
  if (error) {
    notify(error);
    return;
  }
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'กำลังสร้าง PDF...';
  let stage;
  try {
    await ensurePdfLogoDataUrl();
    stage = createOffscreenPages(mode);
    await waitForPdfStageAssets(stage);
    const pages = [...stage.querySelectorAll('.dtd-document-page')];
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let index = 0; index < pages.length; index += 1) {
      const canvas = await html2canvas(pages[index], {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000
      });
      const image = canvas.toDataURL('image/png');
      if (index > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(image, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
    }
    const suffix = mode === 'current' ? `_${activePage}` : '_original-copy-set';
    const filename = `${safeFilename(state.docNo || 'delivery-tax-invoice')}${suffix}.pdf`;
    pdf.save(filename);
  } catch (error) {
    console.error(error);
    notify(`สร้าง PDF ไม่สำเร็จ: ${error?.message || error}`);
  } finally {
    stage?.remove();
    button.disabled = false;
    button.textContent = originalText;
  }
}

function printDocuments(mode = 'all') {
  const error = validateBeforeSave();
  if (error) {
    notify(error);
    return;
  }
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    notify('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up สำหรับเว็บไซต์นี้');
    return;
  }
  const cssUrl = new URL('./delivery-tax-document.css', window.location.href).href;
  const selectedPage = PAGE_TYPES.find(page => page.id === activePage) || PAGE_TYPES[0];
  const html = mode === 'current' ? documentPagesHtml(selectedPage, false) : PAGE_TYPES.map(page => documentPagesHtml(page, false)).join('');
  printWindow.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escapeHtml(state.docNo)}</title><link rel="stylesheet" href="${cssUrl}"><style>body{margin:0;background:#fff}.dtd-document-page{page-break-after:always;margin:0 auto}.dtd-document-page:last-child{page-break-after:auto}@page{size:A4 portrait;margin:0}</style></head><body>${html}<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script></body></html>`);
  printWindow.document.close();
}

function safeFilename(value) {
  return String(value).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 120);
}

function handleTemplateUpload(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    notify('กรุณาเลือกไฟล์ PDF เท่านั้น');
    return;
  }
  if (uploadedTemplateUrl) URL.revokeObjectURL(uploadedTemplateUrl);
  uploadedTemplateUrl = URL.createObjectURL(file);
  const status = document.getElementById('dtd-template-status');
  if (status) {
    status.innerHTML = `เลือกไฟล์แล้ว: <b>${escapeHtml(file.name)}</b> <button type="button" data-action="show-template">เปิดดู PDF ต้นแบบ</button>`;
  }
}

function showUploadedTemplate() {
  if (!uploadedTemplateUrl) return;
  const box = document.getElementById('dtd-template-preview');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = `<div class="dtd-template-preview-head"><b>PDF ต้นแบบจากเครื่อง</b><button type="button" onclick="this.closest('.dtd-template-preview').hidden=true">ปิด</button></div><iframe src="${uploadedTemplateUrl}" title="PDF ต้นแบบ"></iframe>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


function buildStateFromInvoicePreview(inv = {}, ref = {}) {
  const previewState = createDefaultState();
  const branch = ref.b || inv.branch || previewState.branch || 'khonkaen';
  if (BRANCH_DEFAULTS[branch]) {
    previewState.branch = branch;
    previewState.company = { ...branchCompany(branch) };
  }
  previewState.customerName = inv.customer || '';
  previewState.customerAddress = inv.customerAddress || inv.address || '';
  previewState.customerTaxId = inv.customerTaxId || '';
  previewState.contact = inv.contact || '';
  previewState.phone = inv.phone || '';
  previewState.docNo = inv.no || previewState.docNo;
  previewState.date = inv.date || previewState.date;
  previewState.dueDate = inv.dueDate || previewState.dueDate;
  previewState.salesperson = inv.salesPerson || '';
  previewState.vatEnabled = Number(inv.useVat || 0) === 1;
  previewState.note = inv.note || '';
  previewState.attachments = Array.isArray(inv.attachments) ? inv.attachments.map(item => ({ ...item })) : [];
  previewState.sourceProductionNo = inv.sourceProductionNo || '';
  previewState.sourceQuoteNo = inv.sourceQuoteNo || '';
  previewState.items = Array.isArray(inv.items) && inv.items.length ? inv.items.slice(0, MAX_ITEMS).map(it => ({
    productCode: it.productCode || '', product: it.product || '', unit: it.unit || 'ชิ้น', qty: Number(it.qty) || 1, priceUnit: Number(it.priceUnit ?? it.saleValue) || 0
  })) : [createItem()];
  return previewState;
}
function buildInlineDeliveryHtml(inv = {}, ref = {}, pageId = 'original') {
  const prevState = state;
  const prevActivePage = activePage;
  try {
    state = buildStateFromInvoicePreview(inv, ref);
    activePage = pageId || 'original';
    const page = PAGE_TYPES.find(item => item.id === activePage) || PAGE_TYPES[0];
    return documentPagesHtml(page, false);
  } finally {
    state = prevState;
    activePage = prevActivePage;
  }
}
function renderInlineDeliveryPreview(target, inv = {}, ref = {}, pageId = 'original') {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  el.innerHTML = buildInlineDeliveryHtml(inv, ref, pageId);
}

window.ComformDeliveryTaxDocument = {
  loadFromInvoice,
  open() {
    window.go?.('delivery-tax-doc', null);
    renderAll();
  },
  downloadPdf(mode = 'all') {
    const button = document.querySelector('#delivery-tax-app [data-action="pdf-set"]') || { textContent: 'PDF', disabled: false };
    return downloadPdf(button, mode);
  },
  print(mode = 'all') { return printDocuments(mode); },
  getState() { return JSON.parse(JSON.stringify(state)); },
  buildInlineHtml(inv, ref = {}, pageId = 'original') { return buildInlineDeliveryHtml(inv, ref, pageId); },
  renderInlinePreview(target, inv, ref = {}, pageId = 'original') { return renderInlineDeliveryPreview(target, inv, ref, pageId); }
};

window.addEventListener('comform-auth-ready', () => {
  if (document.getElementById('delivery-tax-app')) applyLockedBranch();
});

window.dispatchEvent(new CustomEvent('comform-document-module-ready', { detail: { module: 'delivery' } }));

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountFeature);
else mountFeature();
