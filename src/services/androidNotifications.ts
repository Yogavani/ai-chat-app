import notifee, {
  AndroidImportance,
  AndroidStyle,
  type AndroidMessagingStyleMessage,
  type AndroidPerson
} from "@notifee/react-native";
import type { FirebaseMessagingTypes } from "@react-native-firebase/messaging";
import { toAbsoluteImageUrl } from "../utils/image";

const CHAT_CHANNEL_ID = "chat_messages";

const parseTimestamp = (rawValue: unknown) => {
  if (typeof rawValue === "number") {
    // Handle second-based epoch from some backends.
    if (rawValue < 1_000_000_000_000) return rawValue * 1000;
    return rawValue;
  }

  if (typeof rawValue === "string" && rawValue.trim().length > 0) {
    const asNumber = Number(rawValue);
    if (!Number.isNaN(asNumber)) {
      if (asNumber < 1_000_000_000_000) return asNumber * 1000;
      return asNumber;
    }

    const date = new Date(rawValue);
    if (!Number.isNaN(date.getTime())) return date.getTime();
  }

  return Date.now();
};

const createChatChannel = async () => {
  return notifee.createChannel({
    id: CHAT_CHANNEL_ID,
    name: "Chat Messages",
    importance: AndroidImportance.HIGH,
    vibration: true
  });
};

const pickFirstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
};

export const displayChatNotificationFromRemoteMessage = async (
  remoteMessage: FirebaseMessagingTypes.RemoteMessage
) => {
  const data = remoteMessage?.data || {};

  const senderName = pickFirstString(
    data.senderName,
    data.sender_name,
    data.title,
    remoteMessage.notification?.title,
    "New message"
  );

  const messageText = pickFirstString(
    data.message,
    data.body,
    data.text,
    remoteMessage.notification?.body,
    "You have a new message"
  );

  const profileImage = toAbsoluteImageUrl(
    pickFirstString(
      data.profileImageUrl,
      data.profile_image_url,
      data.profileImage,
      data.profile_image,
      data.senderProfileImage,
      data.sender_profile_image,
      data.avatar,
      data.image
    )
  );

  const sentAt = parseTimestamp(
    data.sentAt ?? data.sent_at ?? data.timestamp ?? remoteMessage.sentTime
  );

  const senderId = pickFirstString(data.senderId, data.sender_id, data.fromUserId);

  const person: AndroidPerson = {
    name: senderName,
    icon: profileImage || undefined
  };

  const styleMessage: AndroidMessagingStyleMessage = {
    text: messageText,
    timestamp: sentAt,
    person
  };

  const channelId = await createChatChannel();

  await notifee.displayNotification({
    title: senderName,
    body: messageText,
    data: {
      senderId,
      senderName,
      sentAt: String(sentAt)
    },
    android: {
      channelId,
      pressAction: {
        id: "default"
      },
      // Replace this with your own monochrome drawable if needed.
      smallIcon: "ic_launcher",
      largeIcon: profileImage || undefined,
      showTimestamp: true,
      timestamp: sentAt,
      style: {
        type: AndroidStyle.MESSAGING,
        person,
        messages: [styleMessage]
      }
    }
  });
};
