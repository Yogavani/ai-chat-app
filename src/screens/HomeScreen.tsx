import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Modal, Pressable } from "react-native";
import { getUsers } from "../services/userService";
import { User } from "../navigation/navigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import API from "../services/api";
import { useFocusEffect } from "@react-navigation/native";
import { useAppTheme } from "../theme/ThemeContext";
import { toAbsoluteImageUrl } from "../utils/image";

type Props = {
  navigation: any;
};

type ChatListUser = User & {
  lastMessage?: string;
  lastMessageAt?: string | number | null;
  lastMessageSenderId?: number | null;
  hasConversation?: boolean;
  profileImage?: string;
  about?: string;
};

const isChattrAi = (user?: Pick<ChatListUser, "id" | "name"> | null) => {
  if (!user) return false;
  return user.id === 9999999 || user.name?.trim().toLowerCase() === "chattr ai";
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
      const storedUserId = await AsyncStorage.getItem("userId");
      const parsedUserId = storedUserId ? Number(storedUserId) : null;
      setCurrentUserId(parsedUserId);

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

      const contacts = [...(usersWithLastMessage as ChatListUser[])].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      );

      const usersWithConversationOnly = (usersWithLastMessage as ChatListUser[]).filter((item) =>
        Boolean(item.hasConversation) && !isChattrAi(item)
      );

      const sortedConversationUsers = [...usersWithConversationOnly].sort(
        (a, b) => getMessageTimestamp(b.lastMessageAt) - getMessageTimestamp(a.lastMessageAt)
      );
      const chattrAiUser = (usersWithLastMessage as ChatListUser[]).find((item) => isChattrAi(item));
      const sortedUsers = chattrAiUser ? [chattrAiUser, ...sortedConversationUsers] : sortedConversationUsers;
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
                  <Image source={require("../assests/images/chattr_ai_logo.png")} style={styles.avatarImage} />
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
                onPress={() =>
                  navigation.navigate("Chat", {
                    receiverId: item.id,
                    receiverName: item.name,
                    receiverProfileImage: item.profileImage
                  })
                }
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
                  onPress={() => setIsContactsOpen(true)}
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
        onPress={() => setIsContactsOpen(true)}
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
                    <Image source={require("../assests/images/chattr_ai_logo.png")} style={styles.contactAvatar} />
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
