// =====================================================================
// firebase-auth.js — ระบบ Login สำหรับ Multi-tenant SaaS ERP
// =====================================================================
// ไฟล์นี้ใช้คู่กับ index.html
// ทำหน้าที่:
//   1. แสดงหน้าจอ Login ก่อนเข้าใช้งานระบบ
//   2. ตรวจสอบ Email/Password ผ่าน Firebase Authentication
//   3. โหลดโปรไฟล์ผู้ใช้จาก Firestore (collection "users") เพื่อรู้ว่าอยู่สาขาไหน
//   4. ล็อกหน้าจอจนกว่าจะ login สำเร็จ และมีปุ่มออกจากระบบ
//
// ข้อกำหนด: ต้องสร้างบัญชีผู้ใช้ใน Firebase Console > Authentication > Users
// และสร้างเอกสารคู่กันใน Firestore collection "users" โดยใช้ uid เดียวกันเป็น Document ID
// ตัวอย่างเอกสาร: { branch: "khonkaen", displayName: "พนักงานขอนแก่น" }
// บัญชีแอดมินที่เห็นทุกสาขาให้ตั้ง branch เป็น "all"
// =====================================================================

import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig, isFirebaseConfigured, isDemoMode, missingFirebaseEnv } from "./firebase.config.js";
import logoUrl from "./logo.png";

const app = isFirebaseConfigured ? (getApps().length ? getApps()[0] : initializeApp(firebaseConfig)) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

let currentProfile = null;

function injectLoginStyles() {
  if (document.getElementById("auth-style")) return;
  const style = document.createElement("style");
  style.id = "auth-style";
  style.textContent = `
    #auth-overlay{position:fixed;inset:0;background:#eef4fb;z-index:9999;display:flex;align-items:center;justify-content:center;padding:1.5rem}
    #auth-box{background:#fff;border-radius:18px;box-shadow:0 10px 30px rgba(15,23,42,.12);padding:2.25rem 2rem;width:100%;max-width:380px;text-align:center}
    #auth-box img{width:64px;height:64px;object-fit:contain;margin-bottom:.75rem}
    #auth-box h1{font-size:18px;font-weight:800;color:#0f172a;margin-bottom:4px}
    #auth-box p.sub{font-size:13px;color:#64748b;margin-bottom:1.5rem}
    #auth-box input{width:100%;padding:12px 14px;border:1px solid #d1d9e6;border-radius:10px;font-size:15px;margin-bottom:12px;background:#fff;box-sizing:border-box}
    #auth-box input:focus{outline:none;border-color:#1d4ed8;box-shadow:0 0 0 4px rgba(29,78,216,.08)}
    .auth-password-wrap{position:relative;width:100%;margin-bottom:12px}
    .auth-password-wrap input{margin-bottom:0 !important;padding:12px 54px 12px 14px !important;line-height:1.3}
    #auth-box #auth-toggle-password{position:absolute !important;right:12px !important;top:50% !important;transform:translateY(-50%) !important;width:30px !important;min-width:30px !important;max-width:30px !important;height:30px !important;min-height:30px !important;padding:0 !important;margin:0 !important;border:none !important;background:transparent !important;color:#64748b !important;border-radius:999px !important;display:inline-flex !important;align-items:center !important;justify-content:center !important;cursor:pointer !important;font-size:0 !important;line-height:1 !important;box-shadow:none !important;z-index:2 !important}
    #auth-box #auth-toggle-password svg{width:18px;height:18px;display:block;pointer-events:none}
    #auth-box #auth-toggle-password:hover{background:#f1f5f9 !important;color:#1d4ed8 !important}
    #auth-box #auth-toggle-password:focus{outline:none;box-shadow:0 0 0 3px rgba(29,78,216,.12) !important}
    #auth-box button:not(#auth-toggle-password){width:100%;padding:12px;border-radius:10px;border:none;background:#1d4ed8;color:#fff;font-size:15px;font-weight:700;cursor:pointer;margin-top:4px}
    #auth-box button:not(#auth-toggle-password):hover{background:#1741a6}
    #auth-box button:not(#auth-toggle-password):disabled{opacity:.6;cursor:not-allowed}
    #auth-error{color:#b91c1c;font-size:13px;margin-top:10px;min-height:18px}
    #auth-userbar{position:fixed;top:10px;right:14px;z-index:400;background:#fff;border:1px solid #dbe4ef;border-radius:20px;padding:6px 14px;font-size:13px;color:#334155;display:flex;align-items:center;gap:10px;box-shadow:0 2px 6px rgba(15,23,42,.08)}
    #auth-userbar button{border:none;background:#fef2f2;color:#b91c1c;font-size:12px;font-weight:700;padding:5px 10px;border-radius:8px;cursor:pointer}
    body:not(.auth-ready) #app-content{display:none !important}
    body.auth-ready #app-content{display:block !important;visibility:visible !important;opacity:1 !important}
  `;
  document.head.appendChild(style);
}

function passwordEyeIcon(isVisible = false) {
  return isVisible
    ? `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"></path><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path><path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6 0 10 8 10 8a17.4 17.4 0 0 1-3.1 4.2"></path><path d="M6.5 6.5C3.8 8.3 2 12 2 12s4 8 10 8a10.9 10.9 0 0 0 4.2-.8"></path></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
}

function renderLoginScreen() {
  injectLoginStyles();
  if (document.getElementById("auth-overlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "auth-overlay";
  overlay.innerHTML = `
    <div id="auth-box">
      <img src="${logoUrl}" alt="ERP Business Platform">
      <h1>ERP Business Platform</h1>
      <p class="sub">เข้าสู่ระบบบริษัทของคุณ</p>
      <input type="email" id="auth-email" placeholder="อีเมลพนักงาน" autocomplete="username">
      <div class="auth-password-wrap">
        <input type="password" id="auth-password" placeholder="รหัสผ่าน" autocomplete="current-password">
        <button type="button" id="auth-toggle-password" aria-label="แสดงรหัสผ่าน" title="แสดง/ซ่อนรหัสผ่าน"></button>
      </div>
      <button id="auth-submit">เข้าสู่ระบบ</button>
      <div id="auth-error"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const submitBtn = document.getElementById("auth-submit");
  const emailInput = document.getElementById("auth-email");
  const passInput = document.getElementById("auth-password");
  const togglePasswordBtn = document.getElementById("auth-toggle-password");
  const errorBox = document.getElementById("auth-error");

  if (togglePasswordBtn) {
    togglePasswordBtn.innerHTML = passwordEyeIcon(false);
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = passInput.type === "password";
      passInput.type = isPassword ? "text" : "password";
      togglePasswordBtn.innerHTML = passwordEyeIcon(isPassword);
      togglePasswordBtn.setAttribute(
        "aria-label",
        isPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"
      );
      togglePasswordBtn.setAttribute(
        "title",
        isPassword ? "ซ่อนรหัสผ่าน" : "แสดง/ซ่อนรหัสผ่าน"
      );
      passInput.focus();
    });
  }

  async function doLogin() {
    const email = emailInput.value.trim();
    const password = passInput.value;
    if (!email || !password) {
      errorBox.textContent = "กรุณากรอกอีเมลและรหัสผ่าน";
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "กำลังเข้าสู่ระบบ...";
    errorBox.textContent = "";
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged ด้านล่างจะจัดการขั้นตอนถัดไปเอง
    } catch (err) {
      errorBox.textContent = mapAuthError(err.code);
      submitBtn.disabled = false;
      submitBtn.textContent = "เข้าสู่ระบบ";
    }
  }

  submitBtn.addEventListener("click", doLogin);
  passInput.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
}

function mapAuthError(code) {
  const map = {
    "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
    "auth/user-disabled": "บัญชีนี้ถูกระงับการใช้งาน",
    "auth/user-not-found": "ไม่พบบัญชีผู้ใช้นี้",
    "auth/wrong-password": "รหัสผ่านไม่ถูกต้อง",
    "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    "auth/too-many-requests": "พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่"
  };
  return map[code] || "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}

function removeLoginScreen() {
  const overlay = document.getElementById("auth-overlay");
  if (overlay) overlay.remove();
}

function renderUserBar(profile, email) {
  let bar = document.getElementById("auth-userbar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "auth-userbar";
    document.body.appendChild(bar);
  }
  const branchLabel = profile?.branch === "all"
    ? "ทุกสาขาที่ได้รับสิทธิ์"
    : profile?.branch === "khonkaen"
      ? "สาขาที่ 00001"
      : profile?.branch === "ubon"
        ? "สาขาสำนักงานใหญ่"
        : (profile?.branch || "ไม่ระบุสาขา");
  const company = profile?.tenantName || profile?.companyName || "บริษัท";
  const role = profile?.role ? ` · ${profile.role}` : "";
  bar.innerHTML = `
    <span>🏢 ${company} · 👤 ${profile?.displayName || email}${role} · ${branchLabel}</span>
    <button id="auth-logout-btn">ออกจากระบบ</button>
  `;
  document.getElementById("auth-logout-btn").addEventListener("click", async () => {
    window.ComformTenant?.clearActiveTenantId?.();
    if (auth) await signOut(auth);
  });
}

function applyTenantBranding(profile = {}) {
  const company = profile.tenantName || profile.companyName || 'ERP Business Platform';
  const title = document.getElementById('tenant-company-title');
  if (title) title.textContent = company;
  const subtitle = document.getElementById('tenant-company-subtitle');
  if (subtitle) subtitle.textContent = `ระบบ ERP · ${profile.subscriptionStatus || 'Business'} · ข้อมูลแยกตามบริษัท`;
  document.title = `${company} — ERP`;
}

function showApp() {
  document.body.classList.add("auth-ready");
  const content = document.getElementById("app-content");
  if (content) {
    content.removeAttribute("hidden");
    content.style.display = "block";
    content.style.visibility = "visible";
    content.style.opacity = "1";
  } else {
    console.warn("ไม่พบ #app-content ใน index.html");
  }
}

function hideApp() {
  document.body.classList.remove("auth-ready");
  const content = document.getElementById("app-content");
  if (content) content.style.display = "none";
  const bar = document.getElementById("auth-userbar");
  if (bar) bar.remove();
}

async function loadUserProfile(uid) {
  if (!db) return null;

  // users/{uid} is a small immutable bootstrap document managed by server/admin.
  // It tells the app which tenant/company owns this user. Business data is never
  // read from global collections after this point.
  const userSnap = await getDoc(doc(db, "users", uid));
  if (!userSnap.exists()) return null;
  const bootstrap = userSnap.data() || {};
  const tenantId = String(bootstrap.tenantId || bootstrap.companyId || '').trim();
  if (!tenantId || bootstrap.active === false) return null;

  const [tenantSnap, memberSnap] = await Promise.all([
    getDoc(doc(db, "tenants", tenantId)),
    getDoc(doc(db, "tenants", tenantId, "members", uid))
  ]);
  if (!tenantSnap.exists() || !memberSnap.exists()) return null;

  const tenant = tenantSnap.data() || {};
  const member = memberSnap.data() || {};
  if (tenant.active === false || member.active === false) return null;

  const role = String(member.role || bootstrap.role || 'viewer');
  const allowedBranches = Array.isArray(member.allowedBranches)
    ? member.allowedBranches.filter(Boolean)
    : (member.branch ? [member.branch] : []);
  const hasAllBranches = ['owner','admin'].includes(role) || allowedBranches.includes('*');
  const branch = hasAllBranches || allowedBranches.length !== 1 ? 'all' : allowedBranches[0];

  return {
    ...bootstrap,
    ...member,
    tenantId,
    companyId: tenantId,
    tenantName: tenant.name || tenant.companyName || bootstrap.companyName || '',
    companyName: tenant.name || tenant.companyName || bootstrap.companyName || '',
    companyProfile: tenant.companyProfile || {},
    subscriptionStatus: tenant.subscriptionStatus || tenant.subscription?.status || 'unknown',
    branchLimit: Number(tenant.branchLimit ?? tenant.subscription?.branchLimit ?? 1),
    activeBranchCount: Number(tenant.activeBranchCount ?? 0),
    role,
    allowedBranches,
    branch
  };
}

function activateLocalDemoMode(reason = 'demo') {
  currentProfile = {
    uid: 'local-demo',
    email: 'demo@local',
    displayName: 'Demo',
    tenantId: 'demo-tenant',
    companyId: 'demo-tenant',
    tenantName: 'Demo Company',
    companyName: 'Demo Company',
    role: 'owner',
    allowedBranches: ['*'],
    branch: 'all',
    subscriptionStatus: 'demo',
    branchLimit: 2,
    activeBranchCount: 2,
    localDemo: true
  };
  window.CurrentUser = currentProfile;
  window.ComformTenant?.setActiveTenantId?.(currentProfile.tenantId);
  removeLoginScreen();
  applyTenantBranding(currentProfile);
  showApp();
  document.body.classList.add('firebase-local-mode');
  try {
    window.dispatchEvent(new CustomEvent('comform-auth-ready', { detail: currentProfile }));
  } catch (_) {}
  console.info('[Comform ERP] Local/demo mode active:', reason);
}

if (isFirebaseConfigured && !isDemoMode) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentProfile = null;
      window.CurrentUser = null;
      window.ComformTenant?.clearActiveTenantId?.();
      hideApp();
      if (!document.getElementById("auth-overlay")) renderLoginScreen();
      return;
    }

    try {
      const profile = await loadUserProfile(user.uid);
      if (!profile) {
        document.getElementById("auth-error") &&
          (document.getElementById("auth-error").textContent =
            "บัญชีนี้ยังไม่ได้ผูกบริษัท/สิทธิ์สมาชิก กรุณาติดต่อผู้ดูแลระบบ");
        window.ComformTenant?.clearActiveTenantId?.();
        await signOut(auth);
        return;
      }
      currentProfile = { uid: user.uid, email: user.email, ...profile };
      window.CurrentUser = currentProfile;
      window.ComformTenant?.setActiveTenantId?.(currentProfile.tenantId);
      removeLoginScreen();
      applyTenantBranding(currentProfile);
      renderUserBar(profile, user.email);
      showApp();
      window.dispatchEvent(new CustomEvent("comform-auth-ready", { detail: currentProfile }));
    } catch (err) {
      console.error("โหลดโปรไฟล์ผู้ใช้ล้มเหลว:", err);
      hideApp();
    }
  });

  // แสดงหน้า Login ทันทีตอนเริ่มโหลดหน้าเว็บ ก่อนรู้สถานะ login
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (!document.getElementById("auth-overlay")) renderLoginScreen();
    });
  } else {
    renderLoginScreen();
  }
} else {
  // Vercel-safe fallback: do not leave the whole UI frozen if env is missing.
  const reason = isDemoMode ? 'VITE_DEMO_MODE=true' : `missing Firebase env: ${missingFirebaseEnv.join(', ')}`;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => activateLocalDemoMode(reason), { once: true });
  } else {
    activateLocalDemoMode(reason);
  }
}

window.ComformAuth = { auth, getCurrentProfile: () => currentProfile };
