const admin = require("firebase-admin");

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (privateKey) {
  // Handle escaped newlines that commonly occur in env variables
  privateKey = privateKey.replace(/\\n/g, "\n");
}

let firebaseApp = null;

if (projectId && clientEmail && privateKey) {
  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    console.log("🔥 Firebase Admin SDK initialized successfully.");
  } catch (error) {
    console.error("❌ Firebase Admin SDK initialization failed:", error.message);
  }
} else {
  console.warn(
    "⚠️ Firebase configuration missing in environment variables. FCM will be disabled."
  );
}

module.exports = admin;
