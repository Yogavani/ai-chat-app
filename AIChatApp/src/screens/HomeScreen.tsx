import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet ,TouchableOpacity, Image, PermissionsAndroid, Platform } from "react-native";
import { getUsers } from "../services/userService";
import { User } from "../navigation/navigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import API from "../services/api";
import { useFocusEffect } from "@react-navigation/native";
import { useAppTheme } from "../theme/ThemeContext";
import { toAbsoluteImageUrl } from "../utils/image";
import messaging from '@react-native-firebase/messaging';

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

const HomeScreen = ({ navigation } : Props) => {
    const { colors } = useAppTheme();
    const [users, setUsers] = useState<ChatListUser[]>([]);
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    const [failedImageUserIds, setFailedImageUserIds] = useState<number[]>([]);
    useEffect(() => {
        fetchUsers();
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchUsers();
        }, [])
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

    const fetchUsers = async () => {
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
                    if (!parsedUserId) return user;

                    try {
                        const response = await API.get(
                            `/receive-message/${parsedUserId}/${user.id}`
                        );
                        const conversation = Array.isArray(response.data) ? response.data : [];
                        const lastMessage = conversation[conversation.length - 1];

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
                            hasConversation: conversation.length > 0
                        };
                    } catch (error) {
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
                (item) => Boolean(item.hasConversation)
            );

            const sortedUsers = [...usersWithConversationOnly].sort(
                (a, b) => getMessageTimestamp(b.lastMessageAt) - getMessageTimestamp(a.lastMessageAt)
            );

            setUsers(sortedUsers);
            setFailedImageUserIds([]);
        } catch (error) {
            console.log("Fetch users error:", error);

        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>

            <FlatList
                data={users}
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
                            {item.id === 9999 ||
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
                                <View style={[styles.avatarFallback, { backgroundColor: colors.chipBackground }]}>
                                    <Text style={[styles.avatarInitial, { color: colors.primary }]}>
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
                          <Text style={[styles.previewText, { color: colors.secondaryText }]} numberOfLines={1}>
                            {item.lastMessage
                                ? item.lastMessageSenderId === currentUserId
                                    ? `You: ${item.lastMessage}`
                                    : item.lastMessage
                                : "No messages yet"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
            />
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
        backgroundColor: "#ede9fe",
        alignItems: "center",
        justifyContent: "center"
    },
    avatarInitial: {
        fontSize: 18,
        fontWeight: "700",
        color: "#7423d7"
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
    previewText: {
        fontSize: 14,
        color: "#4b5563"
    },
    logoText: {
        fontSize: 30,
        fontFamily: "AlfaSlabOne-Regular", // or your custom font
        letterSpacing: 1,
    }
});
