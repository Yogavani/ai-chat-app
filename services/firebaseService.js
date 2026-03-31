const admin = require("firebase-admin");
let firebaseInitialized = false;

const initializeFirebase = () => {
  if (admin.apps.length || firebaseInitialized) return true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.warn(
      "Firebase disabled: FIREBASE_SERVICE_ACCOUNT_JSON is not set."
    );
    return false;
  }

  try {
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
    return true;
  } catch (error) {
    console.error(
      "Firebase disabled: invalid FIREBASE_SERVICE_ACCOUNT_JSON.",
      error?.message || error
    );
    return false;
  }
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
