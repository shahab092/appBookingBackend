/**
 * firebaseAdmin.js
 *
 * Loads Firebase credentials in two ways:
 *  1. PRODUCTION (Render/cloud): reads FIREBASE_SERVICE_ACCOUNT_JSON env var
 *  2. LOCAL DEV: reads config/firebase-service-account.json file
 *
 * If neither is available, exports null — server keeps running,
 * push notifications are silently skipped.
 */

let admin = null;

try {
  admin = require("firebase-admin");

  let serviceAccount = null;

  // ── 1. Cloud/Render: JSON stored as environment variable ──────────────────
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      console.log("🔥 Firebase: loading credentials from FIREBASE_SERVICE_ACCOUNT_JSON env var.");
    } catch (parseErr) {
      console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON env var:", parseErr.message);
    }
  }

  // ── 2. Local dev: JSON file in config/ ────────────────────────────────────
  if (!serviceAccount) {
    try {
      serviceAccount = require("./firebase-service-account.json");
      console.log("🔥 Firebase: loading credentials from config/firebase-service-account.json.");
    } catch (_) {
      // File not present — expected in production
    }
  }

  if (!serviceAccount) {
    console.warn("⚠️  Firebase credentials not found. Push notifications disabled.");
    console.warn("    → On Render: add FIREBASE_SERVICE_ACCOUNT_JSON environment variable.");
    console.warn("    → Locally:   place config/firebase-service-account.json in the project.");
    admin = null;
  } else if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("🔥 Firebase Admin SDK initialized — project:", serviceAccount.project_id);
  }

} catch (err) {
  if (err.code === "MODULE_NOT_FOUND" && err.message.includes("firebase-admin")) {
    console.warn("⚠️  firebase-admin package not installed. Run: npm install firebase-admin");
  } else {
    console.error("❌ Firebase Admin SDK error:", err.message);
  }
  admin = null;
}

module.exports = admin;
