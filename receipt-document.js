const html2canvas = (...args) => {
  if (typeof window.html2canvas !== 'function') return Promise.reject(new Error('ยังโหลด html2canvas ไม่สำเร็จ'));
  return window.html2canvas(...args);
};
const jsPDF = window.jspdf?.jsPDF;

const RCP_STORAGE_KEY = 'comform_receipt_document_draft_v1';
const tenantStorageKey = key => window.ComformTenant?.storageKey?.(key) || key;
const businessStorageKey = (branch,year,month) => tenantStorageKey(`biz2_${branch}_${year}_${String(Number(month)+1).padStart(2,'0')}`);
const activeTenantPrefix = () => `erp_tenant::${window.ComformTenant?.getActiveTenantId?.() || 'anonymous'}::`;
const unwrapActiveTenantKey = key => String(key||'').startsWith(activeTenantPrefix()) ? String(key).slice(activeTenantPrefix().length) : '';
const MAX_ITEMS = 60;
const ITEM_UNITS_PER_PAGE = 8;
const BLUE = '#0868c9';
const COMPANY_LOGO_URL = new URL('./logo.png', import.meta.url).href;
let pdfLogoDataUrl = '';

// ใบเสร็จใช้โลโก้สีจริงเพื่อให้เข้ากับธีมสีชมพูของระบบ
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
    titleTh: 'ใบเสร็จรับเงิน',
    titleEn: '(ORIGINAL RECEIPT)',
    audience: 'สำหรับลูกค้า / CUSTOMER',
    note: '(เอกสารออกเป็นชุด)'
  },
  {
    id: 'account-copy',
    tab: 'สำเนาสำหรับบัญชี',
    titleTh: 'ใบเสร็จรับเงิน',
    titleEn: '(ACCOUNT COPY RECEIPT)',
    audience: 'สำหรับบัญชี / ACCOUNT',
    note: '(เอกสารออกเป็นชุด)'
  },
  {
    id: 'file-copy',
    tab: 'สำเนาเก็บหลักฐาน',
    titleTh: 'ใบเสร็จรับเงิน',
    titleEn: '(FILE COPY RECEIPT)',
    audience: 'เก็บไว้เป็นหลักฐาน / FILE COPY',
    note: '(เอกสารออกเป็นชุด)'
  }
];

let state = createDefaultState();
let activePage = 'original';
let uploadedTemplateUrl = '';
let invoiceOptionsCache = [];
let invoiceOptionsLoadedAt = 0;
let invoiceFilterMonth = '';
let invoiceFilterSearch = '';

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
    sourceInvoiceId: '',
    sourceInvoiceFirebaseId: '',
    sourceInvoiceNo: '',
    sourceInvoiceYear: today.getFullYear(),
    sourceReceiptNo: '',
    sourceReceiptId: '',
    sourceReceiptFirebaseId: '',
    sourceReceiptBranch: '',
    sourceReceiptYear: '',
    sourceReceiptMonth: '',
    items: [createItem()]
  };
}

function createDefaultDocNo(date = new Date()) {
  const buddhistYear = date.getFullYear() + 543;
  const yy = String(buddhistYear).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `REC${yy}${mm}-0001`;
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
    const originalLogoDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    // ใช้สีจริงของโลโก้ (กรมท่า/ฟ้า/ชมพู) ให้สอดคล้องกับธีมใบเสร็จสีชมพู
    pdfLogoDataUrl = originalLogoDataUrl;
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
    const saved = JSON.parse(localStorage.getItem(tenantStorageKey(RCP_STORAGE_KEY)) || 'null');
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
    localStorage.setItem(tenantStorageKey(RCP_STORAGE_KEY), JSON.stringify(state));
  } catch (error) {
    console.warn('บันทึกร่างเอกสารไม่สำเร็จ', error);
  }
}

function mountFeature() {
  if (document.getElementById('panel-receipt-doc')) return;

  const sidebar = document.querySelector('.sidebar');
  if (false && sidebar && !sidebar.querySelector('.rcp-nav-item')) {
    const billingSection = [...sidebar.querySelectorAll('.nav-sec')].find(el => el.textContent.trim() === 'เอกสารออกบิล');
    const deliveryNav = sidebar.querySelector('.dtd-nav-item');
    const nav = document.createElement('div');
    nav.className = 'nav-item rcp-nav-item';
    nav.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>
      </svg>
      ใบเสร็จรับเงิน
    `;
    nav.addEventListener('click', () => {
      window.go?.('receipt-doc', nav);
      renderAll();
    });
    if (deliveryNav) deliveryNav.insertAdjacentElement('afterend', nav);
    else if (billingSection) billingSection.insertAdjacentElement('afterend', nav);
    else sidebar.appendChild(nav);
  }

  const main = document.querySelector('.main');
  if (!main) return;
  const panel = document.createElement('div');
  panel.id = 'panel-receipt-doc';
  panel.className = 'panel';
  panel.innerHTML = '<div id="receipt-document-app"></div>';
  main.appendChild(panel);

  loadDraft();
  renderAppShell();
  bindEvents();
  renderAll();
  applyLockedBranch();
}

function loadFromReceipt(receipt = {}, ref = {}) {
  state.previewOnly = Boolean(ref.previewOnly);
  const branch = ref.b || receipt.branch || state.branch || 'khonkaen';
  if (BRANCH_DEFAULTS[branch]) {
    state.branch = branch;
    state.company = { ...branchCompany(branch) };
  }
  state.customerName = receipt.customer || '';
  state.docNo = receipt.no || state.docNo;
  state.date = receipt.date || state.date;
  state.salesperson = receipt.salesPerson || '';
  state.vatEnabled = Number(receipt.useVat || 0) === 1;
  state.note = receipt.note || '';
  state.attachments = Array.isArray(receipt.attachments) ? receipt.attachments.map(item => ({ ...item })) : [];
  state.sourceInvoiceNo = receipt.invNo || receipt.sourceInvoiceNo || '';
  state.sourceInvoiceId = receipt.invoiceId || receipt.sourceInvoiceId || '';
  state.sourceInvoiceFirebaseId = receipt.sourceInvoiceFirebaseId || '';
  state.sourceInvoiceYear = receipt.invoiceYear || receipt.sourceInvoiceYear || state.sourceInvoiceYear;
  state.sourceReceiptNo = receipt.no || ref.no || '';
  state.sourceReceiptId = receipt.id || ref.id || '';
  state.sourceReceiptFirebaseId = receipt.firebaseId || '';
  state.sourceReceiptBranch = branch;
  state.sourceReceiptYear = ref.y ?? receipt.year ?? '';
  state.sourceReceiptMonth = ref.m ?? receipt.month ?? '';
  const items = Array.isArray(receipt.items) ? receipt.items : [];
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
  setTimeout(() => document.getElementById('receipt-document-app')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
}

function renderAppShell() {
  const root = document.getElementById('receipt-document-app');
  if (!root) return;
  root.innerHTML = `
    <div class="rcp-page-shell">
      <div class="rcp-toolbar">
        <div class="rcp-brand-title">
          <img src="${COMPANY_LOGO_URL}" alt="โลโก้บริษัท">
          <div>
            <div class="rcp-company-mini">${escapeHtml(window.CurrentUser?.tenantName || window.CurrentUser?.companyName || 'บริษัท')}</div>
            <h2>ออกใบเสร็จรับเงิน</h2>
          </div>
        </div>
        <div class="rcp-toolbar-actions">
          <button type="button" class="rcp-btn" data-action="back-source">← กลับหน้ากรอกข้อมูล</button>
          <button type="button" class="rcp-btn rcp-btn-primary" data-action="save" ${state.previewOnly ? 'disabled title="กรุณาบันทึกข้อมูลใบเสร็จรับเงินก่อนบันทึกเอกสารออกจริง"' : ''}>💾 บันทึกเอกสาร</button>
          <button type="button" class="rcp-btn" data-action="print-current">🖨️ พิมพ์หน้าที่เลือก</button>
          <button type="button" class="rcp-btn" data-action="print-set">🖨️ พิมพ์ชุด</button>
          <button type="button" class="rcp-btn" data-action="pdf-current">⬇ PDF หน้าที่เลือก</button>
          <button type="button" class="rcp-btn rcp-btn-primary" data-action="pdf-set">📄 PDF ต้นฉบับ + สำเนา</button>
        </div>
      </div>

      <div class="rcp-workspace">
        <section class="rcp-editor-card">
          ${invoiceLinkSectionHtml()}
          ${customerSectionHtml()}
          ${documentSectionHtml()}
          ${itemsSectionHtml()}
          ${summarySectionHtml()}
          ${sourceEvidenceHtml()}
          ${templateUploadHtml()}
        </section>

        <section class="rcp-preview-card">
          <div class="rcp-preview-heading">ตัวอย่างเอกสารแบบเรียลไทม์</div>
          <div class="rcp-preview-tabs" id="rcp-preview-tabs"></div>
          <div class="rcp-preview-scroll">
            <div id="rcp-live-preview"></div>
          </div>
          <div id="rcp-template-preview" class="rcp-template-preview" hidden></div>
        </section>
      </div>
    </div>
  `;
}

function sectionHeader(number, title) {
  return `<div class="rcp-section-title"><span>${number}</span>${title}</div>`;
}


function invoiceLinkSectionHtml() {
  const selectedNo = state.sourceInvoiceNo || state.shipTo || '';
  return `
    <div class="rcp-form-section rcp-invoice-link-section">
      ${sectionHeader(1, 'เชื่อมข้อมูลจากใบส่งสินค้า / ใบกำกับภาษี')}
      <div class="rcp-invoice-link-box">
        <div class="rcp-linked-context"><span>สาขาที่กำลังใช้งาน</span><b>${escapeHtml(BRANCH_DEFAULTS[state.branch]?.label || 'กรุณาเลือกสาขา')}</b><small>ระบบจะแสดงเฉพาะเอกสารของสาขา ปี และเดือนที่เลือก</small></div>
        <div class="rcp-grid rcp-grid-4 rcp-linked-filter-grid">
          <label class="rcp-field">
            <span>ปีเอกสาร</span>
            <select id="rcp-source-invoice-year">
              ${invoiceYearOptionsHtml()}
            </select>
          </label>
          <label class="rcp-field">
            <span>เดือน</span>
            <select id="rcp-source-invoice-month"><option value="">ทุกเดือน</option>${Array.from({length:12},(_,i)=>`<option value="${i}" ${String(invoiceFilterMonth)===String(i)?'selected':''}>${i+1}</option>`).join('')}</select>
          </label>
          <label class="rcp-field rcp-span-2">
            <span>ค้นหาเอกสาร</span>
            <input id="rcp-source-invoice-search" type="search" value="${escapeHtml(invoiceFilterSearch)}" placeholder="เลขที่ / ลูกค้า / พนักงาน / สินค้า">
          </label>
          <label class="rcp-field rcp-span-2">
            <span>เลือกใบส่งสินค้า / ใบกำกับภาษี</span>
            <select id="rcp-source-invoice-select">
              ${invoiceSelectOptionsHtml()}
            </select>
          </label>
          <div class="rcp-field rcp-invoice-link-actions">
            <span>&nbsp;</span>
            <button type="button" class="rcp-btn rcp-btn-primary" data-action="load-source-invoice">ดึงข้อมูลเข้าฟอร์ม</button>
            <button type="button" class="rcp-btn" data-action="refresh-source-invoices">รีเฟรชรายการ</button>
          </div>
        </div>
        <div id="rcp-source-invoice-status" class="rcp-source-invoice-status">
          ${selectedNo
            ? `เชื่อมกับเอกสารเลขที่ <strong>${escapeHtml(selectedNo)}</strong> แล้ว ข้อมูลลูกค้า รายการสินค้า และยอดเงินจะอ้างอิงจากเอกสารนี้`
            : 'เลือกเอกสารแล้วกด “ดึงข้อมูลเข้าฟอร์ม” ระบบจะคัดลอกข้อมูลลูกค้า รายการสินค้า VAT และยอดเงินมาให้อัตโนมัติ'}
        </div>
      </div>
    </div>
  `;
}

function invoiceYearOptionsHtml() {
  const current = new Date().getFullYear();
  const selected = Number(state.sourceInvoiceYear || current);
  const years = new Set([selected, current, current - 1, current - 2]);
  invoiceOptionsCache.forEach(inv => {
    const year = Number(inv.year || String(inv.date || '').slice(0, 4));
    if (Number.isFinite(year)) years.add(year);
  });
  return [...years].sort((a, b) => b - a)
    .map(year => `<option value="${year}" ${year === selected ? 'selected' : ''}>พ.ศ. ${year + 543}</option>`)
    .join('');
}

function invoiceSelectOptionsHtml() {
  const selectedId = String(state.sourceInvoiceFirebaseId || state.sourceInvoiceId || '');
  const selectedNo = String(state.sourceInvoiceNo || state.shipTo || '');
  const branch = state.branch;
  const year = Number(state.sourceInvoiceYear || new Date().getFullYear());
  const rows = invoiceOptionsCache
    .filter(inv => (!branch || inv.branch === branch) && Number(inv.year || String(inv.date || '').slice(0, 4)) === year)
    .filter(inv => invoiceFilterMonth === '' || Number(inv.monthIndex ?? inv.month ?? (Number(String(inv.date || '').slice(5,7))-1)) === Number(invoiceFilterMonth))
    .filter(inv => !invoiceFilterSearch || [inv.no,inv.customer,inv.salesPerson,(inv.items||[]).map(i=>i.product).join(' ')].join(' ').toLowerCase().includes(invoiceFilterSearch.toLowerCase()))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.no || '').localeCompare(String(a.no || '')));
  const options = rows.map(inv => {
    const id = String(inv.firebaseId || inv.id || inv.no || '');
    const isSelected = (selectedId && id === selectedId) || (!selectedId && selectedNo && String(inv.no || '') === selectedNo);
    const paid = inv.paid || inv.isPaid || inv.paymentStatus === 'paid';
    const label = `${inv.no || '-'} • ${inv.customer || '-'} • ${fmt(inv.total || inv.itemSaleTotal || 0)} บาท${paid ? ' • ออกใบเสร็จแล้ว' : ''}`;
    return `<option value="${escapeHtml(id)}" ${isSelected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
  return `<option value="">-- เลือกเอกสาร --</option>${options}`;
}

function readLocalIssuedInvoices(year) {
  const rows = [];
  const seen = new Set();
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    const baseKey = unwrapActiveTenantKey(key);
    if (!baseKey || !baseKey.startsWith('biz2_')) continue;
    const parts = baseKey.split('_');
    if (Number(parts[2]) !== Number(year)) continue;
    try {
      const pack = JSON.parse(localStorage.getItem(key) || '{}');
      (pack.issuedInvoices || []).forEach(inv => {
        const unique = String(inv.firebaseId || `${inv.branch || ''}|${inv.no || ''}|${inv.date || ''}|${inv.id || ''}`);
        if (seen.has(unique)) return;
        seen.add(unique);
        rows.push({ ...inv, year: Number(inv.year || year) });
      });
    } catch (error) {
      console.warn('อ่านรายการใบส่งสินค้าในเครื่องไม่สำเร็จ', key, error);
    }
  }
  return rows;
}

function mergeInvoiceOptions(...groups) {
  const result = [];
  const index = new Map();
  groups.flat().forEach(inv => {
    if (!inv) return;
    const key = String(inv.firebaseId || `${inv.branch || ''}|${inv.no || ''}|${inv.date || ''}|${inv.id || ''}`);
    if (index.has(key)) result[index.get(key)] = { ...result[index.get(key)], ...inv };
    else {
      index.set(key, result.length);
      result.push(inv);
    }
  });
  return result;
}

async function loadInvoiceOptions({ force = false } = {}) {
  const year = Number(state.sourceInvoiceYear || new Date().getFullYear());
  const localRows = readLocalIssuedInvoices(year);
  let cloudRows = [];
  const service = window.FirebaseService;
  if (service?.loadCollectionByYear && (force || Date.now() - invoiceOptionsLoadedAt > 30000)) {
    try {
      cloudRows = await service.loadCollectionByYear('issuedInvoices', year);
      invoiceOptionsLoadedAt = Date.now();
    } catch (error) {
      console.warn('โหลดใบส่งสินค้า/ใบกำกับภาษีจาก Firebase ไม่สำเร็จ จะใช้ข้อมูลในเครื่องแทน', error);
    }
  }
  invoiceOptionsCache = mergeInvoiceOptions(invoiceOptionsCache.filter(inv => Number(inv.year) !== year), localRows, cloudRows);
  refreshInvoiceLinkControls();
}

function refreshInvoiceLinkControls() {
  const yearSelect = document.getElementById('rcp-source-invoice-year');
  const invoiceSelect = document.getElementById('rcp-source-invoice-select');
  if (yearSelect) yearSelect.innerHTML = invoiceYearOptionsHtml();
  if (invoiceSelect) invoiceSelect.innerHTML = invoiceSelectOptionsHtml();
}

function findSelectedInvoice() {
  const select = document.getElementById('rcp-source-invoice-select');
  const id = String(select?.value || state.sourceInvoiceFirebaseId || state.sourceInvoiceId || '');
  return invoiceOptionsCache.find(inv => String(inv.firebaseId || inv.id || inv.no || '') === id) || null;
}

function applyInvoiceToReceipt(invoice) {
  if (!invoice) {
    notify('กรุณาเลือกใบส่งสินค้า / ใบกำกับภาษีก่อน');
    return;
  }
  const alreadyPaid = invoice.paid || invoice.isPaid || invoice.paymentStatus === 'paid';
  const linkedToThisReceipt = String(invoice.paidReceiptNo || '') === String(state.docNo || '');
  if (alreadyPaid && !linkedToThisReceipt) {
    const proceed = confirm(`เอกสาร ${invoice.no || ''} ถูกระบุว่าออกใบเสร็จ/ชำระเงินแล้ว\nต้องการดึงข้อมูลมาใช้ต่อหรือไม่?`);
    if (!proceed) return;
  }

  const data = invoice.documentData || {};
  const branch = invoice.branch || data.branch || state.branch;
  state.branch = BRANCH_DEFAULTS[branch] ? branch : state.branch;
  state.company = { ...branchCompany(state.branch), ...(data.company || {}) };
  state.customerName = data.customerName || invoice.customer || '';
  state.customerAddress = data.customerAddress || '';
  state.customerTaxId = data.customerTaxId || '';
  state.contact = data.contact || '';
  state.phone = data.phone || '';
  state.salesperson = data.salesperson || invoice.salesPerson || '';
  state.customerCode = data.customerCode || '';
  state.poNo = data.poNo || '';
  state.doNo = data.doNo || invoice.no || '';
  state.paymentTerm = data.paymentTerm || 'เงินสด';
  state.shipTo = invoice.no || data.docNo || '';
  state.vatEnabled = Number(invoice.useVat ?? (data.vatEnabled ? 1 : 0)) === 1;
  state.note = data.note || invoice.note || state.note || '';
  state.sourceInvoiceId = invoice.id || '';
  state.sourceInvoiceFirebaseId = invoice.firebaseId || '';
  state.sourceInvoiceNo = invoice.no || '';
  state.sourceInvoiceYear = Number(invoice.year || String(invoice.date || '').slice(0, 4) || new Date().getFullYear());
  const sourceItems = Array.isArray(data.items) && data.items.length ? data.items : (invoice.items || []);
  state.items = sourceItems.map(item => ({
    productCode: item.productCode || '',
    product: item.product || '',
    unit: item.unit || 'ชิ้น',
    qty: parseMoney(item.qty),
    priceUnit: parseMoney(item.priceUnit)
  }));
  if (!state.items.length) state.items = [createItem()];

  persistDraft();
  renderAppShell();
  bindEvents();
  renderAll();
  applyLockedBranch();
  loadInvoiceOptions();
}

function receiptExistsForSourceInvoice(invoiceNo, currentReceiptNo = '') {
  if (!invoiceNo) return false;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    const baseKey = unwrapActiveTenantKey(key);
    if (!baseKey || !baseKey.startsWith('biz2_')) continue;
    try {
      const pack = JSON.parse(localStorage.getItem(key) || '{}');
      const duplicate = (pack.issuedReceipts || []).some(receipt =>
        String(receipt.sourceInvoiceNo || receipt.invNo || '') === String(invoiceNo) &&
        String(receipt.no || '') !== String(currentReceiptNo || '')
      );
      if (duplicate) return true;
    } catch (_) {}
  }
  return false;
}

function customerSectionHtml() {
  return `
    <div class="rcp-form-section">
      ${sectionHeader(2, 'ข้อมูลลูกค้า')}
      <div class="rcp-grid rcp-grid-3">
        ${inputHtml('customerName', 'ชื่อลูกค้า', 'ชื่อบริษัท / ลูกค้า', 'rcp-span-2')}
        ${inputHtml('contact', 'ผู้ติดต่อ', 'ชื่อผู้ติดต่อ')}
        ${textareaHtml('customerAddress', 'ที่อยู่', 'ที่อยู่สำหรับออกเอกสาร', 'rcp-span-2')}
        ${inputHtml('phone', 'เบอร์โทร', '000-000-0000')}
        ${inputHtml('customerTaxId', 'เลขประจำตัวผู้เสียภาษี', '0000000000000')}
      </div>
    </div>
  `;
}

function documentSectionHtml() {
  const locked = getLockedBranch();
  return `
    <div class="rcp-form-section">
      ${sectionHeader(3, 'ข้อมูลเอกสาร')}
      <div class="rcp-grid rcp-grid-4">
        <div class="rcp-field rcp-span-2">
          <span>เลือกสาขา *</span>
          <div class="rcp-branch-options" role="group" aria-label="เลือกสาขาสำหรับออกเอกสาร">
            <button type="button" class="rcp-branch-option ${state.branch === 'ubon' ? 'active' : ''}" data-action="set-branch" data-branch="ubon" ${locked && locked !== 'ubon' ? 'disabled' : ''}>
              <span class="rcp-branch-dot ub"></span><b>สาขาสำนักงานใหญ่</b><small>HEAD OFFICE</small>
            </button>
            <button type="button" class="rcp-branch-option ${state.branch === 'khonkaen' ? 'active' : ''}" data-action="set-branch" data-branch="khonkaen" ${locked && locked !== 'khonkaen' ? 'disabled' : ''}>
              <span class="rcp-branch-dot kk"></span><b>สาขาที่ 00001</b><small>BRANCH 00001</small>
            </button>
          </div>
          ${locked ? `<small class="rcp-branch-lock-note">บัญชีนี้ถูกกำหนดให้ใช้งาน ${escapeHtml(BRANCH_DEFAULTS[locked]?.label || locked)}</small>` : '<small class="rcp-branch-lock-note">Admin สามารถเลือกสาขาก่อนออกเอกสารได้</small>'}
        </div>
        ${inputHtml('docNo', 'เลขที่/No. *', 'REC-0001')}
        <div class="rcp-grid-line-break" aria-hidden="true"></div>
        ${optionalDateInputHtml('date', 'วันที่')}
        ${optionalDateInputHtml('dueDate', 'วันครบกำหนด')}
        ${inputHtml('customerCode', 'รหัสลูกค้า', 'เช่น 012')}
        ${inputHtml('poNo', 'P/O No.', 'เลขที่ใบสั่งซื้อ')}
        ${inputHtml('doNo', 'D/O No.', 'เลขที่ใบส่งของ')}
        ${inputHtml('salesperson', 'พนักงานขาย', 'ชื่อพนักงานขาย')}
        <label class="rcp-field">
          <span>เงื่อนไขการชำระเงิน</span>
          <select data-field="paymentTerm">
            ${['เงินสด', 'เครดิต 7 วัน', 'เครดิต 15 วัน', 'เครดิต 30 วัน', 'เครดิต 45 วัน', 'เครดิต 60 วัน'].map(v => `<option ${state.paymentTerm === v ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </label>
        ${inputHtml('shipTo', 'เลขที่อ้างอิง/ใบแจ้งหนี้', 'เลขที่เอกสารอ้างอิง', 'rcp-span-2')}
        ${inputHtml('buyerName', 'ผู้รับเงิน', 'ชื่อผู้รับเงิน')}
      </div>
      <details class="rcp-company-settings">
        <summary>ตั้งค่าข้อมูลหัวเอกสารของสาขา</summary>
        <div class="rcp-grid rcp-grid-2">
          ${inputHtml('company.companyNameTh', 'ชื่อบริษัทภาษาไทย', '', 'rcp-span-2')}
          ${inputHtml('company.companyNameEn', 'ชื่อบริษัทภาษาอังกฤษ', '', 'rcp-span-2')}
          ${textareaHtml('company.addressTh', 'ที่อยู่ภาษาไทย', '', 'rcp-span-2')}
          ${inputHtml('company.addressEn', 'ที่อยู่ภาษาอังกฤษ', '', 'rcp-span-2')}
          ${inputHtml('company.phone', 'เบอร์โทรบริษัท', '000-000-0000')}
          ${inputHtml('company.taxId', 'เลขประจำตัวผู้เสียภาษีบริษัท', '0000000000000')}
        </div>
      </details>
    </div>
  `;
}

function itemsSectionHtml() {
  return `
    <div class="rcp-form-section">
      ${sectionHeader(4, 'รายการสินค้า')}
      <div class="rcp-items-wrap">
        <table class="rcp-items-editor">
          <thead>
            <tr><th>#</th><th>รหัสสินค้า</th><th>รายการ</th><th>หน่วยนับ</th><th>จำนวน</th><th>ราคาต่อหน่วย</th><th>จำนวนเงิน</th><th></th></tr>
          </thead>
          <tbody id="rcp-items-editor-body"></tbody>
        </table>
      </div>
      <button type="button" class="rcp-add-item" data-action="add-item">＋ เพิ่มรายการ</button>
      <div class="rcp-item-limit">เพิ่มได้สูงสุด ${MAX_ITEMS} รายการ • ช่องรายละเอียดรองรับหลายบรรทัด • ระบบจะแบ่งหน้า PDF ต่อเนื่องให้อัตโนมัติ</div>
    </div>
  `;
}

function summarySectionHtml() {
  return `
    <div class="rcp-form-section">
      ${sectionHeader(5, 'สรุปยอด')}
      <div class="rcp-summary-grid">
        <label class="rcp-field">
          <span>ภาษีมูลค่าเพิ่ม</span>
          <select data-field="vatEnabled">
            <option value="1" ${state.vatEnabled ? 'selected' : ''}>รวม VAT 7%</option>
            <option value="0" ${!state.vatEnabled ? 'selected' : ''}>ไม่รวม VAT 7%</option>
          </select>
          <small class="rcp-vat-help">รวม VAT 7% = รวมมูลค่าสินค้า + VAT 7% • ไม่รวม VAT 7% = ถอดฐานภาษีด้วย รวมมูลค่าสินค้า × 100 ÷ 107 แล้วบวก VAT 7%</small>
        </label>
        <div class="rcp-summary-box"><span>รวมมูลค่าสินค้า</span><strong id="rcp-subtotal">0.00</strong><em>บาท</em></div>
        <div class="rcp-summary-box"><span>ภาษีมูลค่าเพิ่ม (7%)</span><strong id="rcp-vat">0.00</strong><em>บาท</em></div>
        <div class="rcp-summary-box rcp-summary-grand"><span>ยอดรวมทั้งสิ้น</span><strong id="rcp-grand">0.00</strong><em>บาท</em></div>
      </div>
      <label class="rcp-field rcp-full-field"><span>จำนวนเงินเป็นตัวอักษร</span><input id="rcp-baht-text" readonly></label>
      ${inputHtml('note', 'หมายเหตุ', 'ข้อความเพิ่มเติมในเอกสาร', 'rcp-full-field')}
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
    return `<div class="rcp-source-evidence-item">
      ${imageSrc ? `<img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(name)}">` : `<div class="rcp-source-evidence-icon">${type.includes('pdf') ? 'PDF' : '📎'}</div>`}
      <div class="rcp-source-evidence-name">${escapeHtml(name)}</div>
      ${driveLink ? `<a href="${escapeHtml(driveLink)}" target="_blank" rel="noopener">เปิดหลักฐาน</a>` : '<small>หลักฐานจากข้อมูลต้นทาง</small>'}
    </div>`;
  }).join('');
  return `<div class="rcp-form-section rcp-source-evidence-section">
    ${sectionHeader(6, 'หลักฐานที่แนบมากับใบเสร็จรับเงิน')}
    ${files.length ? `<div class="rcp-source-evidence-grid">${cards}</div>` : '<div class="rcp-source-evidence-empty">ยังไม่มีรูปภาพหรือ PDF หลักฐานในข้อมูลต้นทาง</div>'}
  </div>`;
}

function templateUploadHtml() {
  return `
    <div class="rcp-form-section">
      ${sectionHeader(7, 'แนบเอกสารต้นแบบ')}
      <label class="rcp-template-upload">
        <input type="file" id="rcp-template-file" accept="application/pdf,.pdf">
        <span class="rcp-upload-icon">☁</span>
        <strong>อัปโหลด PDF ต้นแบบ</strong>
        <small>ลากไฟล์ PDF มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</small>
        <small>ไฟล์นี้ใช้เปิดดูเป็นเอกสารอ้างอิง ส่วน PDF ที่ระบบสร้างจะใช้แบบใบเสร็จรับเงิน 3 หน้าด้านขวา</small>
      </label>
      <div id="rcp-template-status" class="rcp-template-status"></div>
    </div>
  `;
}

function optionalDateInputHtml(field, label) {
  const value = escapeHtml(getNestedValue(state, field));
  return `
    <label class="rcp-field rcp-optional-date-field">
      <span>${label} <small>(ไม่บังคับ)</small></span>
      <div class="rcp-optional-date-control">
        <input type="date" data-field="${field}" value="${value}">
        <button type="button" class="rcp-clear-date" data-action="clear-date" data-field-target="${field}">ไม่ระบุวันที่</button>
      </div>
      <small class="rcp-optional-date-hint">เลือกวันที่ได้ หรือกด “ไม่ระบุวันที่” เพื่อเว้นว่างในเอกสาร</small>
    </label>
  `;
}

function inputHtml(field, label, placeholder = '', className = '', type = 'text') {
  return `
    <label class="rcp-field ${className}">
      <span>${label}</span>
      <input type="${type}" data-field="${field}" value="${escapeHtml(getNestedValue(state, field))}" placeholder="${escapeHtml(placeholder)}">
    </label>
  `;
}

function textareaHtml(field, label, placeholder = '', className = '') {
  return `
    <label class="rcp-field ${className}">
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
  const root = document.getElementById('receipt-document-app');
  if (!root || root.dataset.bound === '1') return;
  root.dataset.bound = '1';

  root.addEventListener('input', event => {
    if (event.target?.id === 'rcp-source-invoice-search') { invoiceFilterSearch=event.target.value||''; refreshInvoiceLinkControls(); return; }
    const field = event.target?.dataset?.field;
    if (!field) return;
    const value = field === 'vatEnabled' ? event.target.value === '1' : event.target.value;
    setNestedValue(state, field, value);
    persistDraft();
    updateComputedAndPreview();
  });

  root.addEventListener('change', event => {
    if (event.target?.id === 'rcp-source-invoice-month') { invoiceFilterMonth=event.target.value; refreshInvoiceLinkControls(); return; }
    if (event.target?.id === 'rcp-source-invoice-search') { invoiceFilterSearch=event.target.value||''; refreshInvoiceLinkControls(); return; }
    if (event.target?.id === 'rcp-source-invoice-year') {
      state.sourceInvoiceYear = Number(event.target.value) || new Date().getFullYear();
      persistDraft();
      loadInvoiceOptions({ force: true });
      return;
    }
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
    if (action === 'set-branch') setBranch(button.dataset.branch);
    if (action === 'clear-date') clearOptionalDate(button.dataset.fieldTarget);
    if (action === 'add-item') addItem();
    if (action === 'remove-item') removeItem(Number(button.dataset.index));
    if (action === 'back-source') {
      window.go?.('receipt-form', document.querySelector('.nav-item[onclick*="receipt-form"]'));
      return;
    }
    if (action === 'save') await saveDocumentToSystem(button);
    if (action === 'print-current') printDocuments('current');
    if (action === 'print-set') printDocuments('all');
    if (action === 'pdf-current') await downloadPdf(button, 'current');
    if (action === 'pdf-set') await downloadPdf(button, 'all');
    if (action === 'show-template') showUploadedTemplate();
    if (action === 'load-source-invoice') applyInvoiceToReceipt(findSelectedInvoice());
    if (action === 'refresh-source-invoices') await loadInvoiceOptions({ force: true });
  });

  root.addEventListener('input', event => {
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
    if (event.target.id === 'rcp-template-file') handleTemplateUpload(event.target.files?.[0]);
  });
}

function clearOptionalDate(field) {
  if (!['date', 'dueDate'].includes(field)) return;
  setNestedValue(state, field, '');
  const input = document.querySelector('#receipt-document-app [data-field="' + field + '"]');
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
  }
}

function renderAll() {
  renderItemsEditor();
  renderTabs();
  updateComputedAndPreview();
  loadInvoiceOptions();
}

function renderItemsEditor() {
  const body = document.getElementById('rcp-items-editor-body');
  if (!body) return;
  body.innerHTML = state.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><input data-item-field="productCode" data-index="${index}" value="${escapeHtml(item.productCode)}" placeholder="รหัส"></td>
      <td><textarea rows="2" data-item-field="product" data-index="${index}" placeholder="ชื่อสินค้า / รายละเอียด (พิมพ์หลายบรรทัดได้)">${escapeHtml(item.product)}</textarea></td>
      <td><input data-item-field="unit" data-index="${index}" value="${escapeHtml(item.unit)}" placeholder="หน่วย"></td>
      <td><input type="number" min="0" step="0.01" data-item-field="qty" data-index="${index}" value="${item.qty}"></td>
      <td><input type="number" min="0" step="0.01" data-item-field="priceUnit" data-index="${index}" value="${item.priceUnit}"></td>
      <td class="rcp-item-amount" id="rcp-item-amount-${index}">${fmt(parseMoney(item.qty) * parseMoney(item.priceUnit))}</td>
      <td><button type="button" class="rcp-remove-item" data-action="remove-item" data-index="${index}" title="ลบรายการ">🗑</button></td>
    </tr>
  `).join('');
}

function updateItemAmount(index) {
  const cell = document.getElementById(`rcp-item-amount-${index}`);
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
  const tabs = document.getElementById('rcp-preview-tabs');
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
  const subtotal = document.getElementById('rcp-subtotal');
  const vat = document.getElementById('rcp-vat');
  const grand = document.getElementById('rcp-grand');
  const words = document.getElementById('rcp-baht-text');
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
  const preview = document.getElementById('rcp-live-preview');
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
    <tr class="rcp-data-row" style="height:${(3.15 * units).toFixed(2)}em">
      <td>${escapeHtml(item.productCode)}</td>
      <td class="rcp-doc-desc">${escapeHtml(item.product).replace(/\n/g, '<br>')}</td>
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
  const pageCounter = totalPages > 1 ? `<span class="rcp-doc-page-counter">หน้ารายการ ${pageNumber}/${totalPages}</span>` : '';
  const subtotalText = isFinalPage ? fmt(sum.subtotal) : '';
  const vatText = isFinalPage ? fmt(sum.vat) : '';
  const grandText = isFinalPage ? fmt(sum.grand) : '';
  const bahtTextValue = isFinalPage ? bahtText(sum.grand) : 'มีรายการต่อหน้าถัดไป';

  return `
    <article class="rcp-document-page ${pdfMode ? 'rcp-pdf-page' : ''} ${!isFinalPage ? 'rcp-continuation-page' : ''}" data-page-id="${pageType.id}" data-item-page="${pageNumber}">
      <div class="rcp-doc-topbar">
        <div class="rcp-doc-serial-no"><span>เลขที่/No.</span> <strong>${escapeHtml(state.docNo)}</strong>${pageCounter}</div>
      </div>
      <header class="rcp-doc-header">
        <div class="rcp-doc-company">
          <img src="${logoSrc}" alt="Company Logo" crossorigin="anonymous" decoding="sync">
          <div>
            <div class="rcp-doc-company-th">${escapeHtml(company.companyNameTh)}</div>
            <div class="rcp-doc-company-en">${escapeHtml(company.companyNameEn)}</div>
            <div class="rcp-doc-contact">${escapeHtml(company.addressTh)}</div>
            <div class="rcp-doc-contact">${escapeHtml(company.addressEn)}</div>
            <div class="rcp-doc-contact">${escapeHtml((company.phone || '').trim().startsWith('Tel:') ? company.phone : `Mobile : ${company.phone || ''}`)}</div>
            <div class="rcp-doc-tax">เลขประจำตัวผู้เสียภาษี ${escapeHtml(company.taxId)}</div>
          </div>
        </div>
        <div class="rcp-doc-title">
          <h3>${pageType.tab}</h3>
          <h2>${pageType.titleTh}</h2>
          <div>${pageType.titleEn}</div>
          <h4>${pageType.audience}</h4>
          <small>${pageType.note}</small>
        </div>
      </header>

      <section class="rcp-doc-party-grid rcp-receipt-party-grid">
        <div class="rcp-doc-party-box rcp-receipt-party-box">
          <div><b>ชื่อลูกค้า / Customer name :</b> ${escapeHtml(state.customerName)}</div>
          <div><b>ที่อยู่ / Address :</b><br>${escapeHtml(state.customerAddress).replace(/\n/g, '<br>')}</div>
          ${state.contact || state.phone ? `<div class="rcp-receipt-contact"><b>ผู้ติดต่อ / Contact :</b> ${escapeHtml(state.contact)} ${state.phone ? `&nbsp;&nbsp; <b>โทร / Tel :</b> ${escapeHtml(state.phone)}` : ''}</div>` : ''}
          <div class="rcp-doc-party-bottom"><b>เลขประจำตัวผู้เสียภาษี</b> ${escapeHtml(state.customerTaxId)}</div>
        </div>
      </section>

      <table class="rcp-doc-meta-table">
        <thead><tr>
          <th>รหัสลูกค้า<br><span>Customer code</span></th>
          <th>ใบส่งสินค้าเลขที่<br><span>D/O. No.</span></th>
          <th>ใบสั่งซื้อเลขที่<br><span>P/O. No.</span></th>
          <th>พนักงานขาย<br><span>Salesman</span></th>
          <th>เงื่อนไขการชำระเงิน<br><span>Payment Term</span></th>
          <th>วันครบกำหนด<br><span>Due Date</span></th>
          <th>วันที่<br><span>Date</span></th>
        </tr></thead>
        <tbody><tr>
          <td>${escapeHtml(state.customerCode)}</td>
          <td>${escapeHtml(state.doNo)}</td>
          <td>${escapeHtml(state.poNo)}</td>
          <td>${escapeHtml(state.salesperson)}</td>
          <td>${escapeHtml(state.paymentTerm)}</td>
          <td>${formatDate(state.dueDate)}</td>
          <td>${formatDate(state.date)}</td>
        </tr></tbody>
      </table>

      <div class="rcp-doc-items-section">
        <table class="rcp-doc-items-table">
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
        <img class="rcp-doc-watermark" src="${logoSrc}" alt="" crossorigin="anonymous" decoding="sync">
        <div class="rcp-doc-bottom-area">
          <div class="rcp-doc-payment-note">
            <div>โปรดชำระเงินเข้าบัญชีของบริษัท <b>${escapeHtml(company.companyNameTh || window.CurrentUser?.tenantName || 'บริษัท')}</b></div>
            <div>ได้รับชำระเงินตามรายการข้างต้นเรียบร้อยแล้ว</div>
            ${state.note ? `<div>หมายเหตุ: ${escapeHtml(state.note)}</div>` : ''}
            ${!isFinalPage ? `<div class="rcp-doc-next-page-note">รายการต่อหน้าถัดไป (${pageNumber + 1}/${totalPages})</div>` : ''}
            <div class="rcp-doc-baht"><b>บาท<br><span>Baht</span></b><strong>${bahtTextValue}</strong></div>
          </div>
          <div class="rcp-doc-totals">
            <div><span>รวมมูลค่าสินค้า<br><em>Total</em></span><strong>${subtotalText}</strong></div>
            <div><span>ภาษีมูลค่าเพิ่ม 7%<br><em>VAT 7%</em></span><strong>${vatText}</strong></div>
            <div><span>ยอดรวม<br><em>Grand Total</em></span><strong>${grandText}</strong></div>
          </div>
        </div>
      </div>

      <div class="rcp-doc-terms rcp-receipt-terms">
        <div class="rcp-doc-terms-copy">
          <div>กรณีชำระเงินด้วยเช็ค ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์เมื่อธนาคารเรียกเก็บเงินตามเช็คได้เรียบร้อยแล้ว</div>
          <div>กรณีชำระเงินล่าช้า บริษัทฯ ขอสงวนสิทธิ์คิดดอกเบี้ยในอัตรา 2% ต่อเดือน นับจากวันที่ครบกำหนด</div>
        </div>
        <div class="rcp-doc-officer-label">สำหรับเจ้าหน้าที่ / <span>For officer</span></div>
      </div>

      <section class="rcp-receipt-footer">
        <div class="rcp-receipt-footer-box rcp-receipt-customer-box">
          <div class="rcp-receipt-footer-head"><b>สำหรับลูกค้า</b><span>Customer</span></div>
          <div class="rcp-receipt-footer-body">
            <small>ได้รับต้นฉบับใบเสร็จรับเงินไว้เรียบร้อยแล้ว</small>
            <div class="rcp-receipt-payer-row">
              <span class="rcp-receipt-write-line" aria-hidden="true"></span>
              <span class="rcp-receipt-payer-label">ผู้ส่งมอบ/Payer</span>
              <span class="rcp-receipt-date-write">__/__/__</span>
              <span class="rcp-receipt-date-label">วันที่/Date</span>
            </div>
          </div>
        </div>
        <div class="rcp-receipt-footer-box rcp-receipt-validity-box">
          <div class="rcp-receipt-validity-text">
            <div>ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์เมื่อได้รับเงินสด</div>
            <div>หรือเช็คธนาคารเข้าเป็นเงินผ่านธนาคารเรียบร้อยแล้ว</div>
            <div class="rcp-receipt-validity-en">This receipt will be valid if payment by cash or<br>cheque is collected through the bank.</div>
          </div>
        </div>
        <div class="rcp-receipt-footer-box rcp-receipt-sign-box">
          <div class="rcp-receipt-footer-head"><b>ผู้อนุมัติ</b><span>Authorized signature</span></div>
          <div class="rcp-receipt-footer-body">
            <div class="rcp-receipt-sign-line"></div>
            <div class="rcp-receipt-date-line">____/____/______</div>
          </div>
        </div>
        <div class="rcp-receipt-footer-box rcp-receipt-sign-box">
          <div class="rcp-receipt-footer-head"><b>ผู้รับเงิน</b><span>Collector</span></div>
          <div class="rcp-receipt-footer-body">
            <div class="rcp-receipt-sign-line"></div>
            <div class="rcp-receipt-date-line">____/____/______</div>
          </div>
        </div>
      </section>
    </article>
  `;
}

function signatureBox(th, en, note = '', footerLeft = '', footerRight = '', customerBox = false) {
  return `
    <div class="rcp-doc-sign-box ${customerBox ? 'rcp-doc-sign-customer' : ''}">
      <div class="rcp-doc-sign-head"><b>${th}</b><span>${en}</span></div>
      <div class="rcp-doc-sign-body">
        ${note ? `<small>${note}</small>` : '<small>&nbsp;</small>'}
        <div class="rcp-doc-sign-line">........................................</div>
        <div class="rcp-doc-sign-date">........../........../..........</div>
        ${(footerLeft || footerRight) ? `
          <div class="rcp-doc-sign-footer">
            <span>${footerLeft}</span>
            <span>${footerRight}</span>
          </div>` : ''}
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
  if (state.sourceInvoiceNo && receiptExistsForSourceInvoice(state.sourceInvoiceNo, state.docNo)) {
    return `ใบส่งสินค้า/ใบกำกับภาษีเลขที่ ${state.sourceInvoiceNo} มีใบเสร็จรับเงินแล้ว กรุณาตรวจสอบเพื่อป้องกันข้อมูลซ้ำ`;
  }
  const validItems = state.items.filter(item => String(item.product || '').trim() && parseMoney(item.qty) > 0);
  if (!validItems.length) return 'กรุณากรอกรายการสินค้าอย่างน้อย 1 รายการ';
  return '';
}

async function saveDocumentToSystem(button) {
  if (state.previewOnly) { notify('นี่คือตัวอย่างจากข้อมูลที่ยังไม่ได้บันทึก กรุณากลับไปบันทึกใบเสร็จรับเงินก่อนบันทึกเอกสารออกจริง'); return; }
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
    pack.issuedReceipts ||= [];
    const sum = totals();
    const existingIndex = pack.issuedReceipts.findIndex(inv => String(inv.no) === String(state.docNo) && String(inv.date) === String(state.date));
    const old = existingIndex >= 0 ? pack.issuedReceipts[existingIndex] : null;
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
      invNo: state.sourceInvoiceNo || state.shipTo || state.doNo || '',
      sourceInvoiceNo: state.sourceInvoiceNo || state.shipTo || state.doNo || '',
      sourceInvoiceId: state.sourceInvoiceId || '',
      sourceInvoiceFirebaseId: state.sourceInvoiceFirebaseId || '',
      collector: state.buyerName || '',
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
      paymentStatus: 'paid',
      paid: true,
      isPaid: true,
      paidAt: old?.paidAt || new Date().toISOString(),
      paidBy: old?.paidBy || '',
      note: state.note,
      sourceReceiptNo: state.sourceReceiptNo || state.docNo || '',
      sourceReceiptId: state.sourceReceiptId || '',
      sourceReceiptFirebaseId: state.sourceReceiptFirebaseId || '',
      attachments: state.attachments?.length ? state.attachments : (old?.attachments || []),
      branch: state.branch,
      year,
      month,
      documentKind: 'receipt-document',
      documentData: JSON.parse(JSON.stringify(state))
    };

    if (existingIndex >= 0) pack.issuedReceipts[existingIndex] = record;
    else pack.issuedReceipts.push(record);
    localStorage.setItem(key, JSON.stringify(pack));

    // เชื่อมเอกสารที่พิมพ์กลับไปยังข้อมูลใบเสร็จต้นทาง เพื่อให้ผู้ใช้เห็นเป็นเอกสารเดียว
    if (state.sourceReceiptNo && state.sourceReceiptBranch && state.sourceReceiptYear !== '' && state.sourceReceiptMonth !== '') {
      try {
        const sourceKey = businessStorageKey(state.sourceReceiptBranch, Number(state.sourceReceiptYear), Number(state.sourceReceiptMonth));
        const sourcePack = JSON.parse(localStorage.getItem(sourceKey) || '{}');
        const sourceReceipt = (sourcePack.receipts || []).find(row => String(row.id) === String(state.sourceReceiptId) || String(row.no) === String(state.sourceReceiptNo));
        if (sourceReceipt) {
          sourceReceipt.issuedDocumentNo = state.docNo;
          sourceReceipt.issuedDocumentId = record.id;
          sourceReceipt.issuedDocumentStatus = 'issued';
          sourceReceipt.issuedDocumentUpdatedAt = new Date().toISOString();
          localStorage.setItem(sourceKey, JSON.stringify(sourcePack));
        }
      } catch (linkError) {
        console.warn('เชื่อมสถานะเอกสารกลับไปยังใบเสร็จเดิมไม่สำเร็จ', linkError);
      }
    }

    let invoicePaymentResult = { found: false, cloudOk: true };
    if (record.invNo && typeof window.markInvoicePaidByReceipt === 'function') {
      try {
        invoicePaymentResult = await window.markInvoicePaidByReceipt(state.branch, record.invNo, null, record);
      } catch (error) {
        console.error('เปลี่ยนสถานะบิลอ้างอิงไม่สำเร็จ', error);
        invoicePaymentResult = { found: true, cloudOk: false };
      }
    }

    let cloudError = null;
    const service = window.FirebaseService;
    if (service) {
      try {
        if (old && service.updateBusinessDoc) {
          await service.updateBusinessDoc('issuedReceipts', record.id, state.branch, year, month, record, old.firebaseId || '');
        } else if (!old && service.saveIssuedReceipt) {
          const ref = await service.saveIssuedReceipt(record);
          if (ref?.id) {
            record.firebaseId = ref.id;
            const refreshed = JSON.parse(localStorage.getItem(key));
            const saved = refreshed.issuedReceipts.find(inv => String(inv.id) === String(record.id));
            if (saved) saved.firebaseId = ref.id;
            localStorage.setItem(key, JSON.stringify(refreshed));
          }
        }
        if (state.sourceReceiptFirebaseId && service.updateBusinessDoc && state.sourceReceiptBranch) {
          try {
            await service.updateBusinessDoc('receipts', state.sourceReceiptId || null, state.sourceReceiptBranch, Number(state.sourceReceiptYear), Number(state.sourceReceiptMonth), {
              issuedDocumentNo: state.docNo,
              issuedDocumentId: record.id,
              issuedDocumentStatus: 'issued',
              issuedDocumentUpdatedAt: new Date().toISOString()
            }, state.sourceReceiptFirebaseId);
          } catch (linkError) {
            console.error('อัปเดตสถานะเอกสารใบเสร็จต้นทางไม่สำเร็จ', linkError);
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
    window.renderIssuedReceiptList?.();
    window.renderIList?.();
    if (cloudError) {
      notify(`บันทึกเอกสารไว้ในเครื่องแล้ว แต่ยังไม่ขึ้น Firebase/เครื่องอื่น
สาเหตุ: ${cloudError?.message || cloudError}`);
    } else if (invoicePaymentResult.found && !invoicePaymentResult.cloudOk) {
      notify('บันทึกใบเสร็จและเปลี่ยนบิลเป็นชำระเงินแล้วในเครื่องนี้ แต่ส่งสถานะขึ้น Firebase ไม่สำเร็จ');
    } else if (invoicePaymentResult.found) {
      notify(existingIndex >= 0 ? 'อัปเดตใบเสร็จและสถานะชำระเงินของบิลเรียบร้อย' : 'บันทึกใบเสร็จและเปลี่ยนบิลอ้างอิงเป็นชำระเงินแล้วเรียบร้อย');
    } else {
      notify(existingIndex >= 0 ? 'อัปเดตเอกสารในระบบเรียบร้อย' : 'บันทึกใบเสร็จรับเงินเข้าระบบเรียบร้อย');
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
  container.className = 'rcp-pdf-stage';
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
    const pages = [...stage.querySelectorAll('.rcp-document-page')];
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
    const filename = `${safeFilename(state.docNo || 'receipt')}${suffix}.pdf`;
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
  const cssUrl = new URL('./receipt-document.css', window.location.href).href;
  const selectedPage = PAGE_TYPES.find(page => page.id === activePage) || PAGE_TYPES[0];
  const html = mode === 'current' ? documentPagesHtml(selectedPage, false) : PAGE_TYPES.map(page => documentPagesHtml(page, false)).join('');
  printWindow.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escapeHtml(state.docNo)}</title><link rel="stylesheet" href="${cssUrl}"><style>body{margin:0;background:#fff}.rcp-document-page{page-break-after:always;margin:0 auto}.rcp-document-page:last-child{page-break-after:auto}@page{size:A4 portrait;margin:0}</style></head><body>${html}<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script></body></html>`);
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
  const status = document.getElementById('rcp-template-status');
  if (status) {
    status.innerHTML = `เลือกไฟล์แล้ว: <b>${escapeHtml(file.name)}</b> <button type="button" data-action="show-template">เปิดดู PDF ต้นแบบ</button>`;
  }
}

function showUploadedTemplate() {
  if (!uploadedTemplateUrl) return;
  const box = document.getElementById('rcp-template-preview');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = `<div class="rcp-template-preview-head"><b>PDF ต้นแบบจากเครื่อง</b><button type="button" onclick="this.closest('.rcp-template-preview').hidden=true">ปิด</button></div><iframe src="${uploadedTemplateUrl}" title="PDF ต้นแบบ"></iframe>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


function buildStateFromReceiptPreview(receipt = {}, ref = {}) {
  const previewState = createDefaultState();
  const branch = ref.b || receipt.branch || previewState.branch || 'khonkaen';
  if (BRANCH_DEFAULTS[branch]) {
    previewState.branch = branch;
    previewState.company = { ...branchCompany(branch) };
  }
  previewState.customerName = receipt.customer || '';
  previewState.customerAddress = receipt.customerAddress || receipt.address || '';
  previewState.customerTaxId = receipt.customerTaxId || '';
  previewState.contact = receipt.contact || '';
  previewState.phone = receipt.phone || '';
  previewState.docNo = receipt.no || previewState.docNo;
  previewState.date = receipt.date || previewState.date;
  previewState.salesperson = receipt.salesPerson || '';
  previewState.vatEnabled = Number(receipt.useVat || 0) === 1;
  previewState.note = receipt.note || '';
  previewState.attachments = Array.isArray(receipt.attachments) ? receipt.attachments.map(item => ({ ...item })) : [];
  previewState.sourceInvoiceNo = receipt.invNo || receipt.sourceInvoiceNo || '';
  previewState.items = Array.isArray(receipt.items) && receipt.items.length ? receipt.items.slice(0, MAX_ITEMS).map(it => ({
    productCode: it.productCode || '', product: it.product || '', unit: it.unit || 'ชิ้น', qty: Number(it.qty) || 1, priceUnit: Number(it.priceUnit ?? it.saleValue) || 0
  })) : [createItem()];
  return previewState;
}
function buildInlineReceiptHtml(receipt = {}, ref = {}, pageId = 'original') {
  const prevState = state;
  const prevActivePage = activePage;
  try {
    state = buildStateFromReceiptPreview(receipt, ref);
    activePage = pageId || 'original';
    const page = PAGE_TYPES.find(item => item.id === activePage) || PAGE_TYPES[0];
    return documentPagesHtml(page, false);
  } finally {
    state = prevState;
    activePage = prevActivePage;
  }
}
function renderInlineReceiptPreview(target, receipt = {}, ref = {}, pageId = 'original') {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  el.innerHTML = buildInlineReceiptHtml(receipt, ref, pageId);
}

window.ComformReceiptDocument = {
  loadFromReceipt,
  open() {
    window.go?.('receipt-doc', null);
    renderAll();
  },
  downloadPdf(mode = 'all') {
    const button = document.querySelector('#receipt-document-app [data-action="pdf-set"]') || { textContent: 'PDF', disabled: false };
    return downloadPdf(button, mode);
  },
  print(mode = 'all') { return printDocuments(mode); },
  getState() { return JSON.parse(JSON.stringify(state)); },
  buildInlineHtml(receipt, ref = {}, pageId = 'original') { return buildInlineReceiptHtml(receipt, ref, pageId); },
  renderInlinePreview(target, receipt, ref = {}, pageId = 'original') { return renderInlineReceiptPreview(target, receipt, ref, pageId); }
};

window.addEventListener('comform-auth-ready', () => {
  if (document.getElementById('receipt-document-app')) applyLockedBranch();
});

window.dispatchEvent(new CustomEvent('comform-document-module-ready', { detail: { module: 'receipt' } }));

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountFeature);
else mountFeature();
