// click-fallback.js — fallback for inline onclick handlers when app.js is bundled as module
(function(){
  function fallbackGo(id, el){
    const panel = document.getElementById('panel-' + id);
    if (!panel) return;
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    panel.classList.add('active');
    if (el && el.classList) {
      el.classList.add('active');
      try { el.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' }); } catch (_) {}
    }
    if (window.innerWidth <= 900) {
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    }
    setTimeout(() => {
      window.renderDash?.();
      window.renderFirebaseDashboardCharts?.();
    }, 0);
  }

  function fallbackSwitchDashTab(t){
    window.dashTab = t;
    ['all','khonkaen','ubon'].forEach(x => {
      const id = 'dt-' + (x === 'khonkaen' ? 'kk' : x === 'ubon' ? 'ub' : 'all');
      document.getElementById(id)?.classList.toggle('active', x === t);
    });
    setTimeout(() => {
      window.renderDash?.();
      window.renderDashCharts?.();
      window.renderFirebaseDashboardCharts?.();
    }, 0);
  }

  if (typeof window.go !== 'function') window.go = fallbackGo;
  if (typeof window.switchDashTab !== 'function') window.switchDashTab = fallbackSwitchDashTab;
})();


// Mobile drawer menu + logo dashboard shortcut
(function(){
  function ready(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function closeMobileMenu(){
    document.body.classList.remove('mobile-menu-open');
    const btn = document.getElementById('mobile-menu-toggle');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function openMobileMenu(){
    document.body.classList.add('mobile-menu-open');
    const btn = document.getElementById('mobile-menu-toggle');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function toggleMobileMenu(){
    if (document.body.classList.contains('mobile-menu-open')) closeMobileMenu();
    else openMobileMenu();
  }

  ready(function(){
    if (!document.getElementById('mobile-menu-backdrop')) {
      const backdrop = document.createElement('div');
      backdrop.id = 'mobile-menu-backdrop';
      backdrop.addEventListener('click', closeMobileMenu);
      document.body.appendChild(backdrop);
    }

    if (!document.getElementById('mobile-menu-toggle')) {
      const btn = document.createElement('button');
      btn.id = 'mobile-menu-toggle';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'เปิดเมนู');
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = '☰';
      btn.addEventListener('click', toggleMobileMenu);
      document.body.appendChild(btn);
    }

    document.querySelectorAll('.sidebar .nav-item').forEach(function(item){
      item.addEventListener('click', function(){
        if (window.innerWidth <= 900) setTimeout(closeMobileMenu, 80);
      });
    });

    const logo = document.querySelector('.company-logo');
    if (logo) {
      logo.setAttribute('title', 'กลับไปหน้าแดชบอร์ด');
      logo.addEventListener('click', function(){
        const dashNav = document.querySelector('.sidebar .nav-item');
        if (typeof window.go === 'function') window.go('dashboard', dashNav);
        closeMobileMenu();
      });
    }

    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape') closeMobileMenu();
    });
  });
})();
