// =====================================================================
// firebase.config.js — Vercel-safe Firebase configuration
// =====================================================================
// Front-end Firebase config is read from VITE_FIREBASE_* variables at build time.
// IMPORTANT: Missing config no longer crashes the whole ERP. Instead, Firebase
// modules can switch to local/demo mode while the UI remains usable.
// =====================================================================

const requiredConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};

export const missingFirebaseEnv = Object.entries(requiredConfig)
  .filter(([, value]) => !String(value || '').trim())
  .map(([key]) => key);

export const isFirebaseConfigured = missingFirebaseEnv.length === 0;
export const firebaseConfigStatus = Object.freeze({
  configured: isFirebaseConfigured,
  missing: [...missingFirebaseEnv]
});

export const firebaseConfig = Object.freeze({
  ...requiredConfig,
  ...(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
    ? { measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID }
    : {})
});

// Optional switch for customer demos. When true, the ERP is allowed to open
// without Firebase Authentication and keeps data in the browser only.
export const isDemoMode = String(import.meta.env.VITE_DEMO_MODE || '').toLowerCase() === 'true';

if (!isFirebaseConfigured) {
  console.warn(
    '[Comform ERP] Firebase is not configured. Running UI in local/demo-capable mode.',
    missingFirebaseEnv
  );
}
