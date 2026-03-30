const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const SERVICE_ACCOUNT_PATH = path.join(
  __dirname,
  "..",
  "config",
  "serviceAccountKey.json"
);

const getServiceAccount = () => {
  // Preferred for cloud deploys: plain JSON in env.
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  // Optional: base64-encoded JSON for env-safe transport.
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const raw = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
      "base64"
    ).toString("utf8");
    return JSON.parse(raw);
  }

  // Local development fallback.
  if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    return JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
  }

  return null;
};

const initializeFirebase = () => {
  if (admin.apps.length) return true;

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    console.warn(
      "Firebase disabled: no service account found. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64."
    );
    return false;
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  return true;
};

const sendNotification = async (token, message) => {
  if (!initializeFirebase()) return;

  try {
    await admin.messaging().send({
      token,
      notification: {
        title: "New Message",
        body: message,
      },
      android: {
        priority: "high",
        notification: {
          sound: "default",
          defaultSound: true
        }
      },
      apns: {
        payload: {
          aps: {
            sound: "default"
          }
        }
      }
    });

    console.log("Notification sent");
  } catch (error) {
    console.log("Notification error:", error);
  }
};

module.exports = { sendNotification };
