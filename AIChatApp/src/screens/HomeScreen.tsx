import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet ,TouchableOpacity, Image, PermissionsAndroid, Platform, Modal, TextInput } from "react-native";
import { getUsers } from "../services/userService";
import { User } from "../navigation/navigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import API from "../services/api";
import { useFocusEffect } from "@react-navigation/native";
import { useAppTheme } from "../theme/ThemeContext";
import { toAbsoluteImageUrl } from "../utils/image";
import messaging from '@react-native-firebase/messaging';
const CHAT_READ_CUTOFFS_KEY = "chat_read_cutoffs_v1";
const AI_CHAT_USER_ID = 9999999;
const AI_CHAT_USER_NAME = "Chattr AI";
const isAIUser = (user: any) =>
    Number(user?.id) === AI_CHAT_USER_ID ||
    String(user?.name || "").trim().toLowerCase() === AI_CHAT_USER_NAME.toLowerCase();

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

const HomeScreen = ({ navigation } : Props) => {
    const { colors } = useAppTheme();
    const [users, setUsers] = useState<ChatListUser[]>([]);
    const [contacts, setContacts] = useState<ChatListUser[]>([]);
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    const [failedImageUserIds, setFailedImageUserIds] = useState<number[]>([]);
    const [isContactsVisible, setIsContactsVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const fetchUsers = useCallback(async () => {
        try {
            const storedUserId = await AsyncStorage.getItem("userId");
            const parsedUserId = storedUserId ? Number(storedUserId) : null;
            setCurrentUserId(parsedUserId);
            const readCutoffsRaw = await AsyncStorage.getItem(CHAT_READ_CUTOFFS_KEY);
            const readCutoffsByUserId: Record<string, number> = readCutoffsRaw
                ? JSON.parse(readCutoffsRaw)
                : {};

            const allUsers = await getUsers();
            const baseUsers = Array.isArray(allUsers) ? allUsers : [];
            const nonAIUsersById = new Map<number, any>();
            let detectedAIUser: any = null;

            baseUsers.forEach((user: any) => {
                if (isAIUser(user)) {
                    if (!detectedAIUser || Number(user?.id) === AI_CHAT_USER_ID) {
                        detectedAIUser = user;
                    }
                    return;
                }
                const id = Number(user?.id);
                if (!Number.isNaN(id)) {
                    nonAIUsersById.set(id, user);
                }
            });

            const withAIUser = [
                ...Array.from(nonAIUsersById.values()),
                {
                    ...(detectedAIUser || {}),
                    id: AI_CHAT_USER_ID,
                    name: AI_CHAT_USER_NAME,
                    email: detectedAIUser?.email || ""
                }
            ];

            const otherUsers = parsedUserId
                ? withAIUser.filter((user: User) => user.id !== parsedUserId)
                : withAIUser;

            const usersWithLastMessage = await Promise.all(
                otherUsers.map(async (user: User) => {
                    if (!parsedUserId) return user;

                    try {
                        const response = await API.get(
                            `/receive-message/${parsedUserId}/${user.id}`
                        );
                        const conversation = Array.isArray(response.data) ? response.data : [];
                        const lastMessage = conversation[conversation.length - 1];
                        const readCutoffMs = Number(readCutoffsByUserId[String(user.id)] || 0);
                        const unreadCount = conversation.filter((item: any) => {
                            const rawMessageTime =
                                item?.created_at ?? item?.updated_at ?? item?.client_created_at;
                            const parsedTime = new Date(rawMessageTime).getTime();
                            const messageTimeMs = Number.isNaN(parsedTime)
                                ? typeof rawMessageTime === "number"
                                    ? rawMessageTime
                                    : 0
                                : parsedTime;

                            return (
                                Number(item?.sender_id) === Number(user.id) &&
                                Number(item?.receiver_id) === Number(parsedUserId) &&
                                messageTimeMs > readCutoffMs &&
                                !isMessageSeen(item)
                            );
                        }).length;

                        return {
                            ...user,
                            profileImage:
                                toAbsoluteImageUrl(
                                    (user as any).profileImage ??
                                    (user as any).avatar ??
                                    (user as any).profile_pic ??
                                    ""
                                ),
                            about:
                                (user as any).about ??
                                (user as any).bio ??
                                "Hey there! I am using AIChatApp.",
                            lastMessage: lastMessage?.message ?? "",
                            lastMessageAt:
                                lastMessage?.created_at ??
                                lastMessage?.updated_at ??
                                null,
                            lastMessageSenderId: lastMessage?.sender_id ?? null,
                            unreadCount,
                            hasConversation: conversation.length > 0
                        };
                    } catch {
                        return {
                            ...user,
                            profileImage:
                                toAbsoluteImageUrl(
                                    (user as any).profileImage ??
                                    (user as any).avatar ??
                                    (user as any).profile_pic ??
                                    ""
                                ),
                            about:
                                (user as any).about ??
                                (user as any).bio ??
                                "Hey there! I am using AIChatApp.",
                            hasConversation: false
                        };
                    }
                })
            );

            const usersWithConversationOnly = (usersWithLastMessage as ChatListUser[]).filter(
                (item) =>
                    Boolean(item.hasConversation) ||
                    Number(item.id) === AI_CHAT_USER_ID ||
                    item.name?.trim()?.toLowerCase() === AI_CHAT_USER_NAME.toLowerCase()
            );

            const sortedUsers = [...usersWithConversationOnly].sort(
                (a, b) => getMessageTimestamp(b.lastMessageAt) - getMessageTimestamp(a.lastMessageAt)
            );
            const sortedContacts = [...(usersWithLastMessage as ChatListUser[])].sort((a, b) =>
                (a.name || "").localeCompare(b.name || "")
            );

            setUsers(sortedUsers);
            setContacts(sortedContacts);
            setFailedImageUserIds([]);
        } catch (error) {
            console.log("Fetch users error:", error);

        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useFocusEffect(
        useCallback(() => {
            fetchUsers();
        }, [fetchUsers])
    );
    
    useEffect(() => {
      const setupNotifications = async () => {
        try {
          if (Platform.OS === "android" && Platform.Version >= 33) {
            const hasPermission = await PermissionsAndroid.check(
              PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
            );

            if (!hasPermission) {
              const permissionResult = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
              );
              if (permissionResult !== PermissionsAndroid.RESULTS.GRANTED) {
                console.log("POST_NOTIFICATIONS permission denied");
                return;
              }
            }
          }

          // Request permission
          await messaging().requestPermission();
    
          // Get token
          const token = await messaging().getToken();
          const userId = await AsyncStorage.getItem("userId");
          if (token && userId) {
            await API.post(`/update-fcm-token/${userId}`, {
              fcm_token: token
            });
          }
    
          console.log("🔥 FCM Token:", token);
        } catch (error) {
          console.log("FCM error:", error);
        }
      };
    
      setupNotifications();

      const unsubscribeTokenRefresh = messaging().onTokenRefresh(async (newToken) => {
        try {
          const userId = await AsyncStorage.getItem("userId");
          if (!userId) return;

          await API.post(`/update-fcm-token/${userId}`, {
            fcm_token: newToken
          });
        } catch (error) {
          console.log("FCM refresh save error:", error);
        }
      });

      return () => {
        unsubscribeTokenRefresh();
      };
    }, []);
    useLayoutEffect(() => {
        navigation.setOptions({
            headerTitle: () => (
                <Text style={[styles.logoText, { color: colors.text }]}>
                  Chattr
                </Text>
            )
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

    const isMessageSeen = (item: any) => {
        return Boolean(
            item?.is_seen ||
            item?.seen_at ||
            (typeof item?.status === "string" && item.status.toLowerCase() === "seen")
        );
    };

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesQuery = (item: ChatListUser) => {
        if (!normalizedQuery) return true;
        const haystack = [
            item.name,
            item.email,
            item.about,
            item.lastMessage
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return haystack.includes(normalizedQuery);
    };

    const filteredChats = normalizedQuery
        ? users.filter(matchesQuery)
        : users;

    const filteredContacts = normalizedQuery
        ? contacts.filter(matchesQuery)
        : [];

    const filteredContactsOnly = filteredContacts.filter(
        (contact) => !filteredChats.some((chat) => chat.id === contact.id)
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search chats or contacts"
                placeholderTextColor={colors.secondaryText}
                style={[
                    styles.searchInput,
                    {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.inputBackground
                    }
                ]}
            />

            <FlatList
                data={filteredChats}
                keyExtractor={(item) => item.id.toString()}
                ListHeaderComponent={
                    normalizedQuery && filteredContactsOnly.length ? (
                        <View style={[styles.searchContactsWrap, { borderColor: colors.border }]}>
                            <Text style={[styles.searchContactsTitle, { color: colors.secondaryText }]}>
                                Contacts
                            </Text>
                            {filteredContactsOnly.map((item) => (
                                <TouchableOpacity
                                    key={`search-contact-${item.id}`}
                                    style={[styles.searchContactRow, { borderBottomColor: colors.border }]}
                                    activeOpacity={0.85}
                                    onPress={() =>
                                        navigation.navigate("Chat", {
                                            receiverId: item.id,
                                            receiverName: item.name,
                                            receiverProfileImage: item.profileImage
                                        })
                                    }
                                >
                                    {item.id === AI_CHAT_USER_ID ||
                                    item.name?.trim().toLowerCase() === AI_CHAT_USER_NAME.toLowerCase() ? (
                                        <Image
                                            source={require("../assests/images/chattr_ai_logo.png")}
                                            style={styles.contactAvatar}
                                        />
                                    ) : item.profileImage && !failedImageUserIds.includes(item.id) ? (
                                        <Image
                                            source={{ uri: item.profileImage }}
                                            style={styles.contactAvatar}
                                            onError={() =>
                                                setFailedImageUserIds((prev) =>
                                                    prev.includes(item.id) ? prev : [...prev, item.id]
                                                )
                                            }
                                        />
                                    ) : (
                                        <View style={[styles.avatarFallback, { backgroundColor: colors.chipBackground, borderColor: colors.border }]}>
                                            <Text style={[styles.avatarInitial, { color: colors.text }]}>
                                                {item.name?.trim()?.charAt(0)?.toUpperCase() || "?"}
                                            </Text>
                                        </View>
                                    )}
                                    <View style={styles.contactTextWrap}>
                                        <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>
                                            {item.name}
                                        </Text>
                                        <Text style={[styles.contactSubtext, { color: colors.secondaryText }]} numberOfLines={1}>
                                            {item.about || item.email || "Tap to start chat"}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : null
                }
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
                            {item.id === 9999999 ||
                            item.name?.trim().toLowerCase() === "chattr ai" ? (
                                <Image
                                    source={require("../assests/images/chattr_ai_logo.png")}
                                    style={styles.avatarImage}
                                />
                            ) : item.profileImage && !failedImageUserIds.includes(item.id) ? (
                                <Image
                                    source={{ uri: item.profileImage }}
                                    style={styles.avatarImage}
                                    onError={() =>
                                        setFailedImageUserIds((prev) =>
                                            prev.includes(item.id) ? prev : [...prev, item.id]
                                        )
                                    }
                                />
                            ) : (
                                <View style={[styles.avatarFallback, { backgroundColor: colors.chipBackground, borderColor: colors.border }]}>
                                    <Text style={[styles.avatarInitial, { color: colors.text }]}>
                                        {item.name?.trim()?.charAt(0)?.toUpperCase() || "?"}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.textContent}
                            activeOpacity={0.8}
                            onPress={() => {
                                setUsers((prev) =>
                                    prev.map((row) =>
                                        row.id === item.id ? { ...row, unreadCount: 0 } : row
                                    )
                                );
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
                            {(item.unreadCount || 0) > 0 ? (
                                <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                                    <Text style={styles.unreadBadgeText}>
                                        {item.unreadCount! > 99 ? "99+" : item.unreadCount}
                                    </Text>
                                </View>
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                ListEmptyComponent={
                    normalizedQuery ? (
                        <View style={[styles.emptyWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
                            <Text style={[styles.emptyTitle, { color: colors.text }]}>No results found</Text>
                            <Text style={[styles.emptySubtitle, { color: colors.secondaryText }]}>
                                Try another name, email, or message text.
                            </Text>
                        </View>
                    ) : (
                        <View style={[styles.emptyWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
                            <Text style={[styles.emptyTitle, { color: colors.text }]}>No chats yet</Text>
                            <Text style={[styles.emptySubtitle, { color: colors.secondaryText }]}>
                                Start a new conversation from your contacts.
                            </Text>
                            <TouchableOpacity
                                style={[styles.emptyActionButton, { backgroundColor: colors.primary }]}
                                onPress={() => setIsContactsVisible(true)}
                                activeOpacity={0.9}
                            >
                                <Text style={styles.emptyActionText}>Start New Chat</Text>
                            </TouchableOpacity>
                        </View>
                    )
                }
            />

            <TouchableOpacity
                style={[styles.fab, { backgroundColor: colors.primary }]}
                onPress={() => setIsContactsVisible(true)}
                activeOpacity={0.9}
            >
                <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>

            <Modal
                animationType="slide"
                transparent
                visible={isContactsVisible}
                onRequestClose={() => setIsContactsVisible(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Select Contact</Text>
                            <TouchableOpacity onPress={() => setIsContactsVisible(false)} activeOpacity={0.8}>
                                <Text style={[styles.modalClose, { color: colors.primary }]}>Close</Text>
                            </TouchableOpacity>
                        </View>

                        <FlatList
                            data={contacts}
                            keyExtractor={(item) => item.id.toString()}
                            showsVerticalScrollIndicator={false}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.contactRow, { borderBottomColor: colors.border }]}
                                    activeOpacity={0.85}
                                    onPress={() => {
                                        setIsContactsVisible(false);
                                        navigation.navigate("Chat", {
                                            receiverId: item.id,
                                            receiverName: item.name,
                                            receiverProfileImage: item.profileImage
                                        });
                                    }}
                                >
                                    {item.id === AI_CHAT_USER_ID ||
                                    item.name?.trim().toLowerCase() === AI_CHAT_USER_NAME.toLowerCase() ? (
                                        <Image
                                            source={require("../assests/images/chattr_ai_logo.png")}
                                            style={styles.contactAvatar}
                                        />
                                    ) : item.profileImage && !failedImageUserIds.includes(item.id) ? (
                                        <Image
                                            source={{ uri: item.profileImage }}
                                            style={styles.contactAvatar}
                                            onError={() =>
                                                setFailedImageUserIds((prev) =>
                                                    prev.includes(item.id) ? prev : [...prev, item.id]
                                                )
                                            }
                                        />
                                    ) : (
                                        <View style={[styles.avatarFallback, { backgroundColor: colors.chipBackground, borderColor: colors.border }]}>
                                            <Text style={[styles.avatarInitial, { color: colors.text }]}>
                                                {item.name?.trim()?.charAt(0)?.toUpperCase() || "?"}
                                            </Text>
                                        </View>
                                    )}

                                    <View style={styles.contactTextWrap}>
                                        <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>
                                            {item.name}
                                        </Text>
                                        <Text style={[styles.contactSubtext, { color: colors.secondaryText }]} numberOfLines={1}>
                                            {item.about || item.email || "Tap to start chat"}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <Text style={[styles.emptyContactText, { color: colors.secondaryText }]}>
                                    No contacts available yet.
                                </Text>
                            }
                        />
                    </View>
                </View>
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
    searchInput: {
        height: 44,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        marginBottom: 10,
        fontSize: 14
    },
    searchContactsWrap: {
        borderWidth: 1,
        borderRadius: 12,
        marginBottom: 10,
        overflow: "hidden"
    },
    searchContactsTitle: {
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 0.5,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 6
    },
    searchContactRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1
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
        backgroundColor: "#ede9fe",
        borderWidth: 1,
        borderColor: "#d1d5db",
        alignItems: "center",
        justifyContent: "center"
    },
    avatarInitial: {
        fontSize: 18,
        fontWeight: "800",
        color: "#111827"
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
    previewRow: {
        flexDirection: "row",
        alignItems: "center"
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
    previewText: {
        flex: 1,
        fontSize: 14,
        color: "#4b5563"
    },
    unreadBadge: {
        marginLeft: 8,
        minWidth: 22,
        height: 22,
        borderRadius: 11,
        paddingHorizontal: 6,
        alignItems: "center",
        justifyContent: "center"
    },
    unreadBadgeText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "700"
    },
    logoText: {
        fontSize: 30,
        fontFamily: "AlfaSlabOne-Regular", // or your custom font
        letterSpacing: 1,
    },
    emptyWrap: {
        marginTop: 28,
        borderWidth: 1,
        borderRadius: 16,
        padding: 18
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: "700"
    },
    emptySubtitle: {
        marginTop: 6,
        fontSize: 14
    },
    emptyActionButton: {
        marginTop: 14,
        alignSelf: "flex-start",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10
    },
    emptyActionText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "700"
    },
    fab: {
        position: "absolute",
        right: 18,
        bottom: 22,
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: "center",
        justifyContent: "center",
        elevation: 5,
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 }
    },
    fabText: {
        color: "#fff",
        fontSize: 30,
        lineHeight: 32,
        fontWeight: "500"
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.35)",
        justifyContent: "flex-end"
    },
    modalCard: {
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        borderWidth: 1,
        borderBottomWidth: 0,
        maxHeight: "72%",
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 18
    },
    modalHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: "700"
    },
    modalClose: {
        fontSize: 14,
        fontWeight: "700"
    },
    contactRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 11,
        borderBottomWidth: 1
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
    contactSubtext: {
        marginTop: 2,
        fontSize: 13
    },
    emptyContactText: {
        textAlign: "center",
        marginTop: 24,
        fontSize: 14
    }
});
