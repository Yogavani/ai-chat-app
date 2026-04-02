/**
 * @format
 */

import { AppRegistry } from 'react-native';
import messaging from "@react-native-firebase/messaging";
import App from './App';
import { name as appName } from './app.json';
import { displayChatNotificationFromRemoteMessage } from "./src/services/androidNotifications";

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  await displayChatNotificationFromRemoteMessage(remoteMessage);
});

AppRegistry.registerComponent(appName, () => App);
