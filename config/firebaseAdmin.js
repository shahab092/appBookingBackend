/**
 * firebaseAdmin.js
 *
 * Initializes Firebase Admin SDK using the service account JSON file.
 * If firebase-admin is not installed or the file is missing, exports null
 * so the server keeps running — only push notifications are disabled.
 */

let admin = null;

try {
  admin = require("firebase-admin");

  // Load credentials directly from the service account JSON file
  const serviceAccount = require("./firebase-service-account.json");

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("🔥 Firebase Admin SDK initialized — project:", serviceAccount.project_id);
  } else {
    console.log("🔥 Firebase Admin SDK already initialized.");
  }
} catch (err) {
  if (err.code === "MODULE_NOT_FOUND") {
    if (err.message.includes("firebase-admin")) {
      console.warn("⚠️  firebase-admin not installed. Run: npm install firebase-admin");
    } else {
      console.warn("⚠️  firebase-service-account.json not found in config/. Push notifications disabled.");
    }
  } else {
    console.error("❌ Firebase Admin SDK initialization failed:", err.message);
  }
  admin = null;
}

module.exports = admin;
