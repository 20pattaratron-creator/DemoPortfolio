// boot-status.js — lightweight runtime diagnostics for static/Vercel deployment.
(function () {
  const state = { errors: [] };

  function addError(kind, message) {
    const text = String(message || '').trim();
    if (!text) return;
    if (!state.errors.some(item => item.message === text)) state.errors.push({ kind, message: text });
  }

  window.addEventListener('error', event => {
    addError('error', event?.error?.message || event?.message || 'JavaScript load error');
  });
  window.addEventListener('unhandledrejection', event => {
    addError('promise', event?.reason?.message || event?.reason || 'Unhandled promise rejection');
  });

  function ensureStyle() {
    if (document.getElementById('runtime-status-style')) return;
    const style = document.createElement('style');
    style.id = 'runtime-status-style';
    style.textContent = `
      #runtime-status-banner{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;max-width:min(92vw,720px);display:flex;align-items:center;gap:12px;padding:11px 14px;border:1px solid #fed7aa;border-radius:14px;background:#fff7ed;color:#9a3412;box-shadow:0 12px 30px rgba(15,23,42,.16);font:600 13px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif}
      #runtime-status-banner b{color:#7c2d12}#runtime-status-banner span{flex:1}#runtime-status-banner button{border:1px solid #fdba74;border-radius:9px;background:#fff;color:#9a3412;padding:7px 10px;font:inherit;cursor:pointer}
      #runtime-mode-badge{position:fixed;right:14px;bottom:14px;z-index:9998;padding:6px 9px;border:1px solid #bfdbfe;border-radius:999px;background:#eff6ff;color:#1d4ed8;font:700 11px system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 3px 12px rgba(15,23,42,.08)}
    `;
    document.head.appendChild(style);
  }

  function showBanner() {
    if (document.getElementById('runtime-status-banner')) return;
    ensureStyle();
    const banner = document.createElement('div');
    banner.id = 'runtime-status-banner';
    banner.innerHTML = `<span><b>ระบบโหลดไม่สมบูรณ์</b><br>ลองรีเฟรชหน้าเว็บ หากยังไม่หายให้ตรวจ Vercel Environment Variables และ Console</span><button type="button">โหลดใหม่</button>`;
    banner.querySelector('button').addEventListener('click', () => location.reload());
    document.body.appendChild(banner);
  }

  function showDemoBadge() {
    if (!document.body.classList.contains('firebase-local-mode') || document.getElementById('runtime-mode-badge')) return;
    ensureStyle();
    const badge = document.createElement('div');
    badge.id = 'runtime-mode-badge';
    badge.textContent = 'DEMO · Local data';
    badge.title = 'โหมดสาธิต: ยังไม่ได้เชื่อม Firebase Production';
    document.body.appendChild(badge);
  }

  window.addEventListener('comform-app-ready', () => {
    document.getElementById('runtime-status-banner')?.remove();
    setTimeout(showDemoBadge, 100);
  });

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      const yearSelect = document.getElementById('dash-year');
      const coreReady = window.ComformAppReady === true && (!yearSelect || yearSelect.options.length > 0);
      if (!coreReady) showBanner();
      showDemoBadge();
    }, 6500);
  });

  window.ComformRuntimeStatus = state;
})();
