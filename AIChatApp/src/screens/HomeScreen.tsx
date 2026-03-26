import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet ,TouchableOpacity, Image } from "react-native";
import { getUsers } from "../services/userService";
import { RootStackParamList, User } from "../navigation/navigation";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import API from "../services/api";
import { useFocusEffect } from "@react-navigation/native";
import { useAppTheme } from "../theme/ThemeContext";

type HomeScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "Home"
>;
type Props = {
    navigation: HomeScreenNavigationProp;
  };

type ChatListUser = User & {
    lastMessage?: string;
    lastMessageAt?: string | number | null;
    lastMessageSenderId?: number | null;
    profileImage?: string;
    about?: string;
};

const HomeScreen = ({ navigation } : Props) => {
    const { colors } = useAppTheme();
    const [users, setUsers] = useState<ChatListUser[]>([]);
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
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
            title: "AIChatApp",
            headerRight: () => (
                <TouchableOpacity
                    onPress={() => navigation.navigate("Settings")}
                    style={styles.settingsButton}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.settingsIcon, { color: colors.text }]}>⚙</Text>
                </TouchableOpacity>
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
                                (user as any).profileImage ??
                                (user as any).avatar ??
                                (user as any).profile_pic ??
                                "",
                            about:
                                (user as any).about ??
                                (user as any).bio ??
                                "Hey there! I am using AIChatApp.",
                            lastMessage: lastMessage?.message ?? "",
                            lastMessageAt:
                                lastMessage?.created_at ??
                                lastMessage?.updated_at ??
                                null,
                            lastMessageSenderId: lastMessage?.sender_id ?? null
                        };
                    } catch (error) {
                        return {
                            ...user,
                            profileImage:
                                (user as any).profileImage ??
                                (user as any).avatar ??
                                (user as any).profile_pic ??
                                "",
                            about:
                                (user as any).about ??
                                (user as any).bio ??
                                "Hey there! I am using AIChatApp."
                        };
                    }
                })
            );

            setUsers(usersWithLastMessage as ChatListUser[]);
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
                            {item.profileImage ? (
                                <Image
                                    source={{ uri: item.profileImage }}
                                    style={styles.avatarImage}
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
                                    receiverName: item.name
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
        backgroundColor: "#dbeafe",
        alignItems: "center",
        justifyContent: "center"
    },
    avatarInitial: {
        fontSize: 18,
        fontWeight: "700",
        color: "#1d4ed8"
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
    settingsButton: {
        paddingHorizontal: 8,
        paddingVertical: 2
    },
    settingsIcon: {
        fontSize: 20,
        color: "#111827"
    }
});
