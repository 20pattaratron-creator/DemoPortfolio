// กราฟแดชบอร์ดจาก Firebase
// ไฟล์นี้ใช้กับ index.firebase.html เท่านั้น
// โดยจะอ่านข้อมูลจาก Firestore ผ่าน window.FirebaseService แล้วแสดงผลในกราฟเดิม

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function safeNum(n) {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v : 0;
}

function fmt(n) {
  return safeNum(n).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function roundMoney(n) {
  return Math.round((safeNum(n) + Number.EPSILON) * 100) / 100;
}

function invoiceNetSales(row = {}) {
  const hasNumber = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  if (hasNumber(row.subtotal)) return roundMoney(row.subtotal);

  const itemSale = hasNumber(row.itemSaleTotal) ? Number(row.itemSaleTotal) : null;
  const rawSale = hasNumber(row.saleTotal) ? Number(row.saleTotal) : null;
  const total = hasNumber(row.total) ? Number(row.total) : 0;
  const mode = row.vatMode || (safeNum(row.vatAmt) > 0 ? (Number(row.useVat) === 1 ? "add" : "extract") : "none");

  if (mode === "extract") return roundMoney((itemSale ?? rawSale ?? total) * 100 / 107);
  if (mode === "add") {
    if (itemSale !== null) return roundMoney(itemSale);
    if (rawSale !== null) return roundMoney(rawSale);
    return roundMoney(total / 1.07);
  }
  return roundMoney(itemSale ?? rawSale ?? total);
}

function detectBranch() {
  if (document.getElementById("dt-kk")?.classList.contains("active")) return "khonkaen";
  if (document.getElementById("dt-ub")?.classList.contains("active")) return "ubon";
  return "all";
}

function itemMonthIndex(x) {
  if (x.monthIndex !== undefined) return Number(x.monthIndex);
  const m = Number(x.month ?? 0);
  return m >= 1 && m <= 12 ? m - 1 : m;
}

function filterBranch(rows, branch) {
  if (branch === "all") return rows;
  return rows.filter(x => x.branch === branch);
}

function metricValue(data, metric, monthIndex = null) {
  let invoices = data.invoices || [];
  let productions = data.productions || [];
  let expenses = data.expenses || [];

  if (monthIndex !== null) {
    invoices = invoices.filter(x => itemMonthIndex(x) === monthIndex);
    productions = productions.filter(x => itemMonthIndex(x) === monthIndex);
    expenses = expenses.filter(x => itemMonthIndex(x) === monthIndex);
  }

  if (metric === "sales") {
    return invoices.reduce((s, x) => s + invoiceNetSales(x), 0);
  }

  if (metric === "production") {
    return productions.reduce((s, x) => s + safeNum(x.total || x.subtotal), 0);
  }

  if (metric === "expense") {
    return expenses.reduce((s, x) => s + safeNum(x.amount), 0);
  }

  if (metric === "profit") {
    const invProfit = invoices.reduce((s, x) => s + safeNum(x.profit), 0);
    const exp = expenses.reduce((s, x) => s + safeNum(x.amount), 0);
    return invProfit - exp;
  }

  return 0;
}

function renderRows(containerId, rows, mode = "money") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const filtered = rows.filter(r => safeNum(r.value) > 0);
  const max = Math.max(...filtered.map(r => safeNum(r.value)), 0);

  if (!filtered.length || max <= 0) {
    el.innerHTML = `<div class="chart-empty">ยังไม่มีข้อมูลจาก Firebase สำหรับแสดงกราฟ</div>`;
    return;
  }

  el.innerHTML = filtered.map(row => {
    const width = Math.max((safeNum(row.value) / max) * 100, 3);
    const valueText = mode === "count" ? `${safeNum(row.value).toLocaleString("th-TH")} รายการ` : `฿${fmt(row.value)}`;

    return `
      <div class="chart-bar-row">
        <div>
          <div class="chart-label">${row.label}</div>
          ${row.sub ? `<div class="chart-note">${row.sub}</div>` : ""}
        </div>
        <div class="chart-track"><div class="chart-fill" style="width:${width}%"></div></div>
        <div class="chart-value">${valueText}</div>
      </div>
    `;
  }).join("");
}

function buildCustomerRows(data, source, mode) {
  const map = new Map();

  function add(name, value, kind) {
    const key = String(name || "ไม่ระบุลูกค้า").trim() || "ไม่ระบุลูกค้า";
    const old = map.get(key) || { label: key, value: 0, count: 0, invoiceValue: 0, productionValue: 0 };
    old.value += safeNum(value);
    old.count += 1;
    if (kind === "invoice") old.invoiceValue += safeNum(value);
    if (kind === "production") old.productionValue += safeNum(value);
    map.set(key, old);
  }

  if (source === "all" || source === "invoices") {
    (data.invoices || []).forEach(x => add(x.customer, x.saleTotal || x.total, "invoice"));
  }

  if (source === "all" || source === "productions") {
    (data.productions || []).forEach(x => add(x.customer, x.total || x.subtotal, "production"));
  }

  return [...map.values()]
    .map(x => ({
      label: x.label,
      value: mode === "count" ? x.count : x.value,
      sub: `บิล ฿${fmt(x.invoiceValue)} · สั่งผลิต ฿${fmt(x.productionValue)} · ${x.count} เอกสาร`
    }))
    .sort((a, b) => safeNum(b.value) - safeNum(a.value))
    .slice(0, 10);
}

window.renderFirebaseDashboardCharts = async function () {
  if (!window.FirebaseService?.loadAllDashboardDataByYear) return;

  const year = Number(document.getElementById("dash-year")?.value || new Date().getFullYear());
  const metric = document.getElementById("dash-chart-metric")?.value || "sales";
  const range = document.getElementById("dash-chart-range")?.value || "monthly";
  const customerSource = document.getElementById("dash-customer-source")?.value || "all";
  const customerMode = document.getElementById("dash-customer-mode")?.value || "value";
  const branch = detectBranch();

  const raw = await window.FirebaseService.loadAllDashboardDataByYear(year);
  const data = {
    invoices: filterBranch(raw.invoices, branch),
    productions: filterBranch(raw.productions, branch),
    expenses: filterBranch(raw.expenses, branch),
    quotes: filterBranch(raw.quotes, branch),
    receipts: filterBranch(raw.receipts, branch)
  };

  let rows;
  if (range === "monthly") {
    rows = MONTHS.map((label, i) => ({
      label,
      value: metricValue(data, metric, i)
    }));
  } else {
    // ในตัวอย่างนี้เปรียบเทียบปีที่เลือกกับปีก่อนหน้าแบบง่าย ๆ
    const prevRaw = await window.FirebaseService.loadAllDashboardDataByYear(year - 1);
    const prev = {
      invoices: filterBranch(prevRaw.invoices, branch),
      productions: filterBranch(prevRaw.productions, branch),
      expenses: filterBranch(prevRaw.expenses, branch)
    };
    rows = [
      { label: String(year - 1 + 543), value: metricValue(prev, metric) },
      { label: String(year + 543), value: metricValue(data, metric) }
    ];
  }

  renderRows("dash-bar-chart", rows, "money");
  renderRows("dash-customer-chart", buildCustomerRows(data, customerSource, customerMode), customerMode === "count" ? "count" : "money");

  const mainSummary = document.getElementById("dash-bar-summary");
  if (mainSummary) mainSummary.innerHTML = `ข้อมูลนี้โหลดจาก <b>Firebase Firestore</b> ปี ${year + 543}`;

  const customerSummary = document.getElementById("dash-customer-summary");
  if (customerSummary) customerSummary.innerHTML = `ลูกค้า Top 10 จากข้อมูล Firebase`;
};

function attachFirebaseChartEvents() {
  [
    "dash-year",
    "dash-month",
    "dash-chart-range",
    "dash-chart-metric",
    "dash-customer-source",
    "dash-customer-mode",
    "dt-all",
    "dt-kk",
    "dt-ub"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", () => window.renderFirebaseDashboardCharts?.());
    if (el?.tagName === "BUTTON") el.addEventListener("click", () => setTimeout(() => window.renderFirebaseDashboardCharts?.(), 100));
  });

  setTimeout(() => window.renderFirebaseDashboardCharts?.(), 600);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", attachFirebaseChartEvents);
} else {
  attachFirebaseChartEvents();
}
