/**
 * @format
 */

import { AppRegistry } from 'react-native';
import notifee, { EventType } from "@notifee/react-native";
import messaging from "@react-native-firebase/messaging";
import App from './App';
import { name as appName } from './app.json';
import { displayChatNotificationFromRemoteMessage } from "./src/services/androidNotifications";
import { trackEvent } from "./src/services/analytics";

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  const senderId = Number(remoteMessage?.data?.senderId || remoteMessage?.data?.sender_id || 0);
  await trackEvent("notification_received", {
    source: "fcm_background",
    sender_id: senderId > 0 ? senderId : undefined
  });
  await displayChatNotificationFromRemoteMessage(remoteMessage);
});

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type !== EventType.PRESS && type !== EventType.ACTION_PRESS) return;
  const senderId = Number(detail.notification?.data?.senderId || 0);
  await trackEvent("notification_opened", {
    source: "background_push",
    sender_id: senderId > 0 ? senderId : undefined
  });
});

AppRegistry.registerComponent(appName, () => App);
