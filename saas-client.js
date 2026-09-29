// =====================================================================
// saas-client.js — tenant/subscription client for same-origin Vercel APIs
// =====================================================================
let tenantSummary = null;

async function authToken() {
  const user = window.ComformAuth?.auth?.currentUser;
  if (!user) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  return user.getIdToken();
}

async function callApi(path, options = {}) {
  const token = await authToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export async function getTenantSummary({ force = false } = {}) {
  if (tenantSummary && !force) return tenantSummary;
  if (window.CurrentUser?.localDemo) {
    tenantSummary = {
      ok: true,
      tenant: {
        id: window.CurrentUser.tenantId || 'demo-tenant',
        name: window.CurrentUser.tenantName || 'Demo Company',
        subscriptionStatus: 'demo',
        plan: 'demo',
        branchLimit: 2,
        activeBranchCount: 2,
        branches: [
          { id:'ubon', name:'สาขาสำนักงานใหญ่', active:true },
          { id:'khonkaen', name:'สาขาที่ 00001', active:true }
        ]
      },
      member: { uid:'local-demo', role:'owner', allowedBranches:['*'] }
    };
    applyBranchAvailability();
    return tenantSummary;
  }
  tenantSummary = await callApi('/api/tenant-summary', { method: 'GET' });
  applyBranchAvailability();
  return tenantSummary;
}

export async function createBranch({ name, code = '' } = {}) {
  const result = await callApi('/api/create-branch', {
    method: 'POST',
    body: JSON.stringify({ name, code })
  });
  tenantSummary = null;
  await getTenantSummary({ force: true });
  return result;
}

export function isBranchActive(branchId) {
  if (!tenantSummary?.tenant?.branches) return true; // before summary loads, server rules remain authoritative
  return tenantSummary.tenant.branches.some(branch => branch.id === branchId && branch.active !== false);
}

function setBranchUiState(branchId, active) {
  const suffix = branchId === 'khonkaen' ? 'kk' : branchId === 'ubon' ? 'ub' : '';
  if (!suffix) return;
  document.querySelectorAll(`[id$="-br-${suffix}"],#dt-${suffix}`).forEach(el => {
    el.classList.toggle('tenant-branch-disabled', !active);
    if ('disabled' in el) el.disabled = !active;
    el.setAttribute('aria-disabled', String(!active));
    el.title = active ? '' : 'สาขานี้ยังไม่เปิดใช้งานในแพ็กเกจ';
  });
  document.querySelectorAll(`select option[value="${branchId}"]`).forEach(option => {
    option.disabled = !active;
  });
}

export function applyBranchAvailability() {
  if (!tenantSummary?.tenant) return;
  const activeIds = new Set((tenantSummary.tenant.branches || []).filter(x => x.active !== false).map(x => x.id));
  ['ubon','khonkaen'].forEach(id => setBranchUiState(id, activeIds.has(id)));
  const allTab = document.getElementById('dt-all');
  if (allTab) allTab.textContent = activeIds.size > 1 ? 'รวมทุกสาขาที่เปิดใช้งาน' : 'ภาพรวมบริษัท';
}

function moneylessMetric(label, value, sub = '', tone = '') {
  return `<div class="mc ${tone}"><div class="lbl">${label}</div><div class="val">${value}</div><div class="sub">${sub}</div></div>`;
}

export async function renderPanel() {
  const cards = document.getElementById('saas-summary-cards');
  const list = document.getElementById('saas-branch-list');
  const status = document.getElementById('saas-action-status');
  if (cards) cards.innerHTML = '<div class="empty">กำลังโหลดข้อมูลแพ็กเกจ...</div>';
  try {
    const data = await getTenantSummary({ force: true });
    const t = data.tenant || {};
    const branches = t.branches || [];
    const profile = window.CurrentUser || {};
    if (cards) cards.innerHTML = [
      moneylessMetric('บริษัท', t.name || '-', `<code>${t.id || '-'}</code>`),
      moneylessMetric('สถานะสมาชิก', t.subscriptionStatus || '-', t.plan || 'Business'),
      moneylessMetric('สาขาที่ใช้', `${branches.length} / ${t.branchLimit || 1}`, 'คิดสิทธิ์ตาม Branch Limit'),
      moneylessMetric('สิทธิ์ผู้ใช้', data.member?.role || profile.role || '-', (data.member?.allowedBranches || []).join(', ') || 'ตาม Role')
    ].join('');
    if (list) list.innerHTML = branches.length ? branches.map(branch => `
      <div class="saas-branch-row">
        <div><b>${branch.name || branch.id}</b><small>${branch.id}</small></div>
        <span class="saas-status-pill">Active</span>
      </div>`).join('') : '<div class="empty">ยังไม่มีสาขาที่เปิดใช้งาน</div>';
    if (status) status.textContent = `แพ็กเกจปัจจุบันใช้ ${branches.length} จาก ${Number(t.branchLimit || 1)} สาขา`;
    applyBranchAvailability();
  } catch (error) {
    if (cards) cards.innerHTML = `<div class="empty">โหลดข้อมูล SaaS ไม่สำเร็จ: ${String(error.message || error)}</div>`;
    if (status) status.textContent = 'ตรวจ Vercel Function และ FIREBASE_ADMIN_*';
  }
}

export async function createBranchFromPanel() {
  const code = document.getElementById('saas-new-branch-code')?.value || '';
  const defaultName = code === 'ubon' ? 'สาขาสำนักงานใหญ่' : code === 'khonkaen' ? 'สาขาที่ 00001' : code;
  const name = document.getElementById('saas-new-branch-name')?.value.trim() || defaultName;
  const status = document.getElementById('saas-action-status');
  if (isBranchActive(code)) {
    if (status) status.textContent = 'สาขานี้เปิดใช้งานอยู่แล้ว';
    return;
  }
  if (status) status.textContent = 'กำลังตรวจ Branch Limit และสร้างสาขา...';
  try {
    await createBranch({ name, code });
    if (status) status.textContent = `เพิ่ม ${name} สำเร็จ`;
    await renderPanel();
    window.notify?.(`เพิ่มสาขา ${name} สำเร็จ`, 'success');
  } catch (error) {
    const map = {
      'branch-limit-reached': 'ใช้จำนวนสาขาครบตามแพ็กเกจแล้ว กรุณาเพิ่ม Branch Limit หลังรับชำระ Add-on',
      'subscription-not-active': 'แพ็กเกจไม่ได้อยู่ในสถานะที่อนุญาตให้เพิ่มสาขา',
      'insufficient-role': 'เฉพาะ Owner/Admin เท่านั้นที่เพิ่มสาขาได้',
      'branch-code-exists': 'รหัสสาขานี้มีอยู่แล้ว'
    };
    const msg = map[error.message] || error.message || 'เพิ่มสาขาไม่สำเร็จ';
    if (status) status.textContent = msg;
    window.notify?.(msg, 'error');
  }
}

window.SaaSService = {
  getTenantSummary,
  createBranch,
  isBranchActive,
  applyBranchAvailability,
  renderPanel,
  createBranchFromPanel
};

window.addEventListener('comform-auth-ready', () => {
  getTenantSummary({ force: true }).catch(err => console.warn('[SaaS] tenant summary unavailable', err));
});
