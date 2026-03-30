const admin = require("firebase-admin");
const serviceAccount = require("../config/serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const sendNotification = async (token, message) => {
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
