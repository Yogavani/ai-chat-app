import { PermissionsAndroid, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import messaging from "@react-native-firebase/messaging";
import API from "./api";

const REGISTERED_FCM_TOKEN_KEY = "registeredFcmToken";
const REGISTERED_FCM_USER_KEY = "registeredFcmUserId";

const requestAndroidNotificationPermission = async () => {
  if (Platform.OS !== "android") return true;
  if (Platform.Version < 33) return true;

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
};

const requestMessagingPermission = async () => {
  const authStatus = await messaging().requestPermission();
  return (
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL
  );
};

const updateTokenInBackend = async (userId: number, token: string) => {
  await API.post(`/update-fcm-token/${userId}`, {
    fcm_token: token
  });

  await AsyncStorage.multiSet([
    [REGISTERED_FCM_TOKEN_KEY, token],
    [REGISTERED_FCM_USER_KEY, userId.toString()]
  ]);
};

export const syncFcmTokenForUser = async (userId: number) => {
  try {
    const hasAndroidPermission = await requestAndroidNotificationPermission();
    if (!hasAndroidPermission) return;

    const hasMessagingPermission = await requestMessagingPermission();
    if (!hasMessagingPermission) return;

    await messaging().registerDeviceForRemoteMessages();
    const currentToken = await messaging().getToken();
    if (!currentToken) return;

    const [savedToken, savedUserId] = await AsyncStorage.multiGet([
      REGISTERED_FCM_TOKEN_KEY,
      REGISTERED_FCM_USER_KEY
    ]);

    const cachedToken = savedToken?.[1] || "";
    const cachedUserId = savedUserId?.[1] || "";

    if (cachedToken === currentToken && cachedUserId === userId.toString()) {
      return;
    }

    await updateTokenInBackend(userId, currentToken);
  } catch (error) {
    console.log("[FCM] sync token failed:", error);
  }
};

export const subscribeFcmTokenRefresh = (userId: number) => {
  return messaging().onTokenRefresh(async (newToken) => {
    try {
      if (!newToken) return;
      await updateTokenInBackend(userId, newToken);
    } catch (error) {
      console.log("[FCM] token refresh sync failed:", error);
    }
  });
};
