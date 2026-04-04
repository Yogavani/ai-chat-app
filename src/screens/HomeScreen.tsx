import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Modal, Pressable } from "react-native";
import { getUsers } from "../services/userService";
import { User } from "../navigation/navigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import API from "../services/api";
import { useFocusEffect } from "@react-navigation/native";
import { useAppTheme } from "../theme/ThemeContext";
import { toAbsoluteImageUrl } from "../utils/image";
import { trackEvent } from "../services/analytics";

type Props = {
  navigation: any;
};

type ChatListUser = User & {
  lastMessage?: string;
  lastMessageAt?: string | number | null;
  lastMessageSenderId?: number | null;
  unreadCount?: number;
  hasConversation?: boolean;
  profileImage?: string;
  about?: string;
};
const CHAT_LAST_READ_KEY = "chatLastReadByUser";

const isChattrAi = (user?: Pick<ChatListUser, "id" | "name"> | null) => {
  if (!user) return false;
  return user.id === 9999999 || user.name?.trim().toLowerCase() === "chattr ai";
};

const isMessageSeen = (message: any) => {
  if (message?.is_seen === true || message?.is_seen === 1 || message?.is_seen === "1") {
    return true;
  }
  if (message?.seen_at) return true;

  const status = String(message?.status || "").trim().toLowerCase();
  return status === "seen" || status === "read";
};

const HomeScreen = ({ navigation }: Props) => {
  const LOADER_PURPLE = "#7423d7";
  const { colors } = useAppTheme();
  const [users, setUsers] = useState<ChatListUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [failedImageUserIds, setFailedImageUserIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allContacts, setAllContacts] = useState<ChatListUser[]>([]);
  const [isContactsOpen, setIsContactsOpen] = useState(false);
  const [showStartConversation, setShowStartConversation] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchUsers();
    }, [])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <Text style={[styles.logoText, { color: colors.text }]}>Chattr</Text>
    });
  }, [navigation, colors.text]);

  const formatRelativeTime = (rawTime?: string | number) => {
    if (!rawTime) return "";
    const date = new Date(rawTime);
    if (Number.isNaN(date.getTime())) return "";

    const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (diffSeconds < 15) return "just now";
    if (diffSeconds < 60) return `${diffSeconds}s ago`;

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short"
    });
  };

  const getMessageTimestamp = (rawTime?: string | number | null) => {
    if (rawTime === null || rawTime === undefined) return 0;
    const parsedDate = new Date(rawTime);
    if (!Number.isNaN(parsedDate.getTime())) return parsedDate.getTime();
    if (typeof rawTime === "number") return rawTime;
    return 0;
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const [storedUserId, storedLastReadByUser] = await Promise.all([
        AsyncStorage.getItem("userId"),
        AsyncStorage.getItem(CHAT_LAST_READ_KEY)
      ]);
      const parsedUserId = storedUserId ? Number(storedUserId) : null;
      setCurrentUserId(parsedUserId);
      const lastReadByUser: Record<string, number> = storedLastReadByUser
        ? JSON.parse(storedLastReadByUser)
        : {};

      const allUsers = await getUsers();
      const otherUsers = parsedUserId
        ? allUsers.filter((user: User) => user.id !== parsedUserId)
        : allUsers;

      const usersWithLastMessage = await Promise.all(
        otherUsers.map(async (user: User) => {
          const enrichedUser = {
            ...user,
            profileImage: toAbsoluteImageUrl(
              (user as any).profileImage ?? (user as any).avatar ?? (user as any).profile_pic ?? ""
            ),
            about: (user as any).about ?? (user as any).bio ?? "Hey there! I am using AIChatApp."
          };

          if (!parsedUserId) return enrichedUser;

          try {
            const response = await API.get(`/receive-message/${parsedUserId}/${user.id}`);
            const conversation = Array.isArray(response.data) ? response.data : [];
            const lastMessage = conversation[conversation.length - 1];

            return {
              ...enrichedUser,
              lastMessage: lastMessage?.message ?? "",
              lastMessageAt: lastMessage?.created_at ?? lastMessage?.updated_at ?? null,
              lastMessageSenderId: lastMessage?.sender_id ?? null,
              unreadCount: conversation.filter(
                (item: any) =>
                  Number(item?.sender_id) === Number(user.id) &&
                  Number(item?.receiver_id) === Number(parsedUserId) &&
                  !isMessageSeen(item) &&
                  getMessageTimestamp(item?.created_at ?? item?.updated_at ?? null) >
                    Number(lastReadByUser[String(user.id)] || 0)
              ).length,
              hasConversation: conversation.length > 0
            };
          } catch {
            return {
              ...enrichedUser,
              hasConversation: false
            };
          }
        })
      );

      const dedupedUsers = (usersWithLastMessage as ChatListUser[]).reduce<ChatListUser[]>(
        (acc, current) => {
          if (!isChattrAi(current)) {
            const alreadyExists = acc.some((item) => item.id === current.id);
            if (!alreadyExists) acc.push(current);
            return acc;
          }

          const aiIndex = acc.findIndex((item) => isChattrAi(item));
          if (aiIndex === -1) {
            acc.push(current);
            return acc;
          }

          // Prefer canonical AI record with id=9999999 when duplicates exist.
          if (current.id === 9999999 && acc[aiIndex].id !== 9999999) {
            acc[aiIndex] = current;
          }
          return acc;
        },
        []
      );

      const contacts = [...dedupedUsers].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      );

      const usersWithConversationOnly = dedupedUsers.filter((item) =>
        Boolean(item.hasConversation)
      );

      const sortedConversationUsers = [...usersWithConversationOnly].sort(
        (a, b) => getMessageTimestamp(b.lastMessageAt) - getMessageTimestamp(a.lastMessageAt)
      );
      const chattrAiUser = dedupedUsers.find((item) => isChattrAi(item));
      const hasAiConversation = sortedConversationUsers.some((item) => isChattrAi(item));
      const sortedUsers =
        !hasAiConversation && chattrAiUser
          ? [...sortedConversationUsers, chattrAiUser]
          : sortedConversationUsers;
      const hasNonAiConversation = sortedConversationUsers.length > 0;

      setUsers(sortedUsers);
      setAllContacts(contacts);
      setShowStartConversation(!hasNonAiConversation);
      setFailedImageUserIds([]);
    } catch (error) {
      console.log("Fetch users error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const markChatAsReadLocally = async (chatUserId: number) => {
    try {
      const existing = await AsyncStorage.getItem(CHAT_LAST_READ_KEY);
      const parsed: Record<string, number> = existing ? JSON.parse(existing) : {};
      parsed[String(chatUserId)] = Date.now();
      await AsyncStorage.setItem(CHAT_LAST_READ_KEY, JSON.stringify(parsed));
    } catch {
      // noop
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      {isLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={LOADER_PURPLE} size="large" />
        </View>
      ) : null}

      <FlatList
        data={users}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={[styles.chatRow, { borderBottomColor: colors.border }]}>
            <View style={styles.rowContent}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() =>
                  navigation.navigate("Profile", {
                    userId: item.id,
                    userName: item.name,
                    userEmail: item.email,
                    profileImage: item.profileImage,
                    about: item.about
                  })
                }
              >
                {item.id === 9999999 || item.name?.trim().toLowerCase() === "chattr ai" ? (
                  <View style={[styles.aiAvatarShell, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Image source={require("../assests/images/chattr_ai_logo.png")} style={styles.aiAvatarLogo} />
                  </View>
                ) : item.profileImage && !failedImageUserIds.includes(item.id) ? (
                  <Image
                    source={{ uri: item.profileImage }}
                    style={styles.avatarImage}
                    onError={() =>
                      setFailedImageUserIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))
                    }
                  />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.avatarInitial, { color: "#ffffff" }]}> 
                      {item.name?.trim()?.charAt(0)?.toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.textContent}
                activeOpacity={0.8}
                onPress={() => {
                  void markChatAsReadLocally(item.id);
                  void trackEvent("chat_opened", {
                    source: "home_list",
                    receiver_id: item.id
                  });
                  navigation.navigate("Chat", {
                    receiverId: item.id,
                    receiverName: item.name,
                    receiverProfileImage: item.profileImage
                  });
                }}
              >
                <View style={styles.topLine}>
                  <Text style={[styles.userName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.timeText, { color: colors.secondaryText }]}> 
                    {formatRelativeTime(item.lastMessageAt ?? undefined)}
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={[styles.previewText, { color: colors.secondaryText }]} numberOfLines={1}>
                    {item.lastMessage
                      ? item.lastMessageSenderId === currentUserId
                        ? `You: ${item.lastMessage}`
                        : item.lastMessage
                      : "No messages yet"}
                  </Text>
                  {item.unreadCount && item.unreadCount > 0 ? (
                    <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.unreadBadgeText}>
                        {item.unreadCount > 99 ? "99+" : String(item.unreadCount)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListFooterComponent={
          !isLoading ? (
            <View style={styles.emptyWrap}>
              {users.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.secondaryText }]}>No chats yet</Text>
              ) : null}
              {showStartConversation ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => {
                    void trackEvent("start_conversation_clicked", { source: "home_empty_state" });
                    setIsContactsOpen(true);
                  }}
                  style={[styles.startConversationButton, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.startConversationText}>Start Conversation</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null
        }
      />

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          void trackEvent("new_chat_clicked", { source: "home_fab" });
          setIsContactsOpen(true);
        }}
        style={[styles.fabButton, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.fabPlusText}>+</Text>
      </TouchableOpacity>

      <Modal visible={isContactsOpen} transparent animationType="slide" onRequestClose={() => setIsContactsOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setIsContactsOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Contact</Text>
              <TouchableOpacity activeOpacity={0.8} onPress={() => setIsContactsOpen(false)}>
                <Text style={[styles.modalClose, { color: colors.secondaryText }]}>Close</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={allContacts}
              keyExtractor={(item) => `contact-${item.id}`}
              ListEmptyComponent={
                <Text style={[styles.contactsEmptyText, { color: colors.secondaryText }]}>No contacts available</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    void trackEvent("contact_selected", {
                      source: "home_contacts_modal",
                      receiver_id: item.id
                    });
                    setIsContactsOpen(false);
                    navigation.navigate("Chat", {
                      receiverId: item.id,
                      receiverName: item.name,
                      receiverProfileImage: item.profileImage
                    });
                  }}
                  style={[styles.contactRow, { borderBottomColor: colors.border }]}
                >
                  {item.id === 9999999 || item.name?.trim().toLowerCase() === "chattr ai" ? (
                    <View style={[styles.aiAvatarShell, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Image source={require("../assests/images/chattr_ai_logo.png")} style={styles.aiAvatarLogo} />
                    </View>
                  ) : item.profileImage && !failedImageUserIds.includes(item.id) ? (
                    <Image
                      source={{ uri: item.profileImage }}
                      style={styles.contactAvatar}
                      onError={() =>
                        setFailedImageUserIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))
                      }
                    />
                  ) : (
                    <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.avatarInitial, { color: "#ffffff" }]}>
                        {item.name?.trim()?.charAt(0)?.toUpperCase() || "?"}
                      </Text>
                    </View>
                  )}
                  <View style={styles.contactTextWrap}>
                    <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.contactSubText, { color: colors.secondaryText }]} numberOfLines={1}>
                      {item.about || item.email}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20
  },
  chatRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb"
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center"
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12
  },
  aiAvatarShell: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  aiAvatarLogo: {
    width: 36,
    height: 36,
    borderRadius: 18
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
    backgroundColor: "#7423d7",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarInitial: {
    fontSize: 19,
    fontWeight: "700",
    color: "#ffffff"
  },
  textContent: {
    flex: 1
  },
  topLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2
  },
  userName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827"
  },
  timeText: {
    fontSize: 12,
    color: "#6b7280"
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  previewText: {
    flex: 1,
    fontSize: 14,
    color: "#4b5563"
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    marginLeft: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  unreadBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700"
  },
  logoText: {
    fontSize: 30,
    fontFamily: "AlfaSlabOne-Regular",
    letterSpacing: 1
  },
  fabButton: {
    position: "absolute",
    right: 22,
    bottom: 26,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }
  },
  fabPlusText: {
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "500",
    marginTop: -2,
    color: "#ffffff"
  },
  loaderWrap: {
    paddingVertical: 20,
    alignItems: "center"
  },
  listContent: {
    paddingBottom: 100
  },
  emptyWrap: {
    marginTop: 26,
    alignItems: "center"
  },
  emptyText: {
    textAlign: "center",
    fontSize: 14
  },
  startConversationButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22
  },
  startConversationText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end"
  },
  modalCard: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 26,
    minHeight: "52%",
    maxHeight: "76%"
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700"
  },
  modalClose: {
    fontSize: 14,
    fontWeight: "600"
  },
  contactsEmptyText: {
    textAlign: "center",
    marginTop: 24,
    fontSize: 14
  },
  contactRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center"
  },
  contactAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12
  },
  contactTextWrap: {
    flex: 1
  },
  contactName: {
    fontSize: 16,
    fontWeight: "600"
  },
  contactSubText: {
    marginTop: 2,
    fontSize: 13
  }
});
