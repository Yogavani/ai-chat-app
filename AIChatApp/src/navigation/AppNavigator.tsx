import React from "react";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, StatusBar, StyleSheet, Text, View } from "react-native";
import { Bot, Compass, House, Settings as SettingsIcon } from "lucide-react-native";


import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import HomeScreen from "../screens/HomeScreen";
import ChatScreen from "../screens/ChatScreen";
import ProfileScreen from "../screens/ProfileScreen";
import SettingsScreen from "../screens/SettingsScreen";
import AIChatScreen from "../screens/AIChatScreen";
import ExploreScreen from "../screens/ExploreScreen";
import PremiumScreen from "../screens/PremiumScreen";
import { MainTabParamList, RootStackParamList } from "./navigation";
import { useAppTheme } from "../theme/ThemeContext";
import { ensureSocketConnection, socket } from "../services/socket";
import { toAbsoluteImageUrl } from "../utils/image";
import { getUsers } from "../services/userService";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const MainTabs = ({ onLogoutSuccess }: { onLogoutSuccess: () => void }) => {
    const { colors } = useAppTheme();

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerStyle: { backgroundColor: colors.card },
                headerTintColor: colors.text,
                headerTitleStyle: { color: colors.text },
                tabBarStyle: {
                    backgroundColor: colors.card,
                    borderTopColor: colors.border
                },
                tabBarActiveTintColor: colors.primary,
                tabBarInactiveTintColor: colors.secondaryText,
                tabBarIcon: ({ color, size }) => {
                    const strokeWidth = 2.1;
                    switch (route.name) {
                        case "Home":
                            return <House color={color} size={size} strokeWidth={strokeWidth} />;
                        case "AIChat":
                            return <Bot color={color} size={size} strokeWidth={strokeWidth} />;
                        case "Status":
                            return <Compass color={color} size={size} strokeWidth={strokeWidth} />;
                        case "Settings":
                            return <SettingsIcon color={color} size={size} strokeWidth={strokeWidth} />;
                        default:
                            return <House color={color} size={size} strokeWidth={strokeWidth} />;
                    }
                }
            })}
        >
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="AIChat" component={AIChatScreen} options={{ title: "AI Toolkit" }} />
            <Tab.Screen name="Status" component={ExploreScreen} />
            <Tab.Screen name="Settings">
                {(props) => <SettingsScreen {...props} onLogoutSuccess={onLogoutSuccess} />}
            </Tab.Screen>
        </Tab.Navigator>
    );
};

const AppNavigator = () => {
    const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
    const { resolvedTheme, colors } = useAppTheme();
    const [incomingNotification, setIncomingNotification] = useState<{
        title: string;
        message: string;
        avatarUrl?: string;
        time: string;
    } | null>(null);
    const notificationTranslateY = useRef(new Animated.Value(-120)).current;
    const hideNotificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const usersByIdRef = useRef<Map<number, { name?: string; avatar?: string }>>(new Map());

    useEffect(() => {
        checkLogin();
    }, []);

    useEffect(() => {
        if (!isLoggedIn) return;

        let activeUserId: number | null = null;

        const onConnect = () => {
            if (activeUserId !== null) {
                socket.emit("join", activeUserId);
            }
        };

        const onReceiveMessage = (msg: any) => {
            if (activeUserId === null) return;
            const toUserId = Number(msg?.receiver_id);
            if (Number.isNaN(toUserId) || toUserId !== activeUserId) return;

            const messageText =
                typeof msg?.message === "string" && msg.message.trim()
                    ? msg.message
                    : "You have a new message.";
            const senderName =
                msg?.sender_name ||
                msg?.senderName ||
                msg?.fromName ||
                usersByIdRef.current.get(Number(msg?.sender_id))?.name ||
                (msg?.sender_id ? `User ${msg.sender_id}` : "New Message");
            const avatarRaw =
                msg?.sender_profile_image ||
                msg?.senderProfileImage ||
                msg?.sender_avatar ||
                msg?.senderAvatar ||
                usersByIdRef.current.get(Number(msg?.sender_id))?.avatar ||
                "";
            const avatarUrl = toAbsoluteImageUrl(avatarRaw) || avatarRaw;
            const eventTime = msg?.created_at ? new Date(msg.created_at) : new Date();
            const time = eventTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            if (hideNotificationTimerRef.current) {
                clearTimeout(hideNotificationTimerRef.current);
                hideNotificationTimerRef.current = null;
            }

            setIncomingNotification({
                title: String(senderName),
                message: messageText,
                avatarUrl,
                time
            });

            Animated.spring(notificationTranslateY, {
                toValue: 0,
                useNativeDriver: true,
                bounciness: 6
            }).start();

            hideNotificationTimerRef.current = setTimeout(() => {
                Animated.timing(notificationTranslateY, {
                    toValue: -120,
                    duration: 220,
                    useNativeDriver: true
                }).start(() => {
                    setIncomingNotification(null);
                });
            }, 2600);
        };

        const setupNotifications = async () => {
            const storedUserId = await AsyncStorage.getItem("userId");
            const parsedUserId = storedUserId ? Number(storedUserId) : null;
            if (parsedUserId === null || Number.isNaN(parsedUserId)) return;

            activeUserId = parsedUserId;

            try {
                const users = await getUsers();
                const nextMap = new Map<number, { name?: string; avatar?: string }>();
                users.forEach((user: any) => {
                    const id = Number(user?.id);
                    if (Number.isNaN(id)) return;
                    nextMap.set(id, {
                        name: user?.name || "",
                        avatar:
                            user?.profileImage ||
                            user?.avatar ||
                            user?.profile_pic ||
                            ""
                    });
                });
                usersByIdRef.current = nextMap;
            } catch {
                usersByIdRef.current = new Map();
            }

            socket.on("connect", onConnect);
            socket.on("receive-message", onReceiveMessage);
            socket.on("new-message", onReceiveMessage);

            if (socket.connected) {
                onConnect();
            } else {
                ensureSocketConnection();
            }
        };

        setupNotifications();

        return () => {
            if (hideNotificationTimerRef.current) {
                clearTimeout(hideNotificationTimerRef.current);
                hideNotificationTimerRef.current = null;
            }
            socket.off("connect", onConnect);
            socket.off("receive-message", onReceiveMessage);
            socket.off("new-message", onReceiveMessage);
        };
    }, [isLoggedIn, notificationTranslateY]);

    const checkLogin = async () => {
        const token = await AsyncStorage.getItem("token");

        if (token) {
            setIsLoggedIn(true);
        } else {
            setIsLoggedIn(false);
        }
    };

    if (isLoggedIn === null) {
        return null;
    }

    return (
        <NavigationContainer
            theme={{
                ...(resolvedTheme === "dark" ? DarkTheme : DefaultTheme),
                colors: {
                    ...(resolvedTheme === "dark" ? DarkTheme.colors : DefaultTheme.colors),
                    background: colors.background,
                    card: colors.card,
                    text: colors.text,
                    border: colors.border,
                    primary: colors.primary
                }
            }}
        >
            {incomingNotification ? (
                <Animated.View
                    style={[
                        styles.notificationWrap,
                        {
                            transform: [{ translateY: notificationTranslateY }],
                            backgroundColor: resolvedTheme === "dark" ? "#0f0f10" : "#ffffff",
                            borderColor: resolvedTheme === "dark" ? "#3f3f46" : colors.border
                        }
                    ]}
                >
                    {incomingNotification.avatarUrl ? (
                        <Image source={{ uri: incomingNotification.avatarUrl }} style={styles.notificationAvatar} />
                    ) : (
                        <View style={[styles.notificationAvatarFallback, { backgroundColor: colors.primary }]}>
                            <Text style={styles.notificationAvatarFallbackText}>
                                {incomingNotification.title.trim().charAt(0).toUpperCase() || "?"}
                            </Text>
                        </View>
                    )}
                    <View style={styles.notificationTextWrap}>
                        <View style={styles.notificationTopRow}>
                            <Text style={[styles.notificationTitle, { color: colors.text }]} numberOfLines={1}>
                                {incomingNotification.title}
                            </Text>
                            <Text style={[styles.notificationTime, { color: colors.secondaryText }]}>
                                {incomingNotification.time}
                            </Text>
                        </View>
                        <Text
                            style={[styles.notificationMessage, { color: colors.secondaryText }]}
                            numberOfLines={1}
                        >
                            {incomingNotification.message}
                        </Text>
                    </View>
                </Animated.View>
            ) : null}
            <StatusBar
                barStyle={resolvedTheme === "dark" ? "light-content" : "dark-content"}
                backgroundColor={colors.card}
                translucent={false}
            />
            <Stack.Navigator
                screenOptions={{
                    headerStyle: { backgroundColor: colors.card },
                    headerTintColor: colors.text,
                    headerTitleStyle: { color: colors.text },
                    contentStyle: { backgroundColor: colors.background },
                    statusBarStyle: resolvedTheme === "dark" ? "light" : "dark"
                }}
            >
                {isLoggedIn ? (
                    <>
                        <Stack.Screen
                            name="MainTabs"
                            options={{ headerShown: false }}
                        >
                            {() => (
                                <MainTabs onLogoutSuccess={() => setIsLoggedIn(false)} />
                            )}
                        </Stack.Screen>
                        <Stack.Screen name="Chat" component={ChatScreen} />
                        <Stack.Screen name="Profile" component={ProfileScreen} />
                        <Stack.Screen name="Premium" component={PremiumScreen} options={{ title: "Premium" }} />
                    </>
                ) : (
                    <>
                        <Stack.Screen name="Login" options={{ headerShown: false }}>
                            {(props) => (
                                <LoginScreen
                                    {...props}
                                    onLoginSuccess={() => setIsLoggedIn(true)}
                                />
                            )}
                        </Stack.Screen>
                        <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>

    );
};

export default AppNavigator;

const styles = StyleSheet.create({
    notificationWrap: {
        position: "absolute",
        top: 14,
        left: 12,
        right: 12,
        zIndex: 999,
        borderWidth: 1,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.14,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
        elevation: 8
    },
    notificationAvatar: {
        width: 34,
        height: 34,
        borderRadius: 17,
        marginRight: 10
    },
    notificationAvatarFallback: {
        width: 34,
        height: 34,
        borderRadius: 17,
        marginRight: 10,
        alignItems: "center",
        justifyContent: "center"
    },
    notificationAvatarFallbackText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "700"
    },
    notificationTextWrap: {
        flex: 1
    },
    notificationTopRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8
    },
    notificationTitle: {
        fontSize: 14,
        fontWeight: "700",
        flex: 1
    },
    notificationTime: {
        fontSize: 11,
        fontWeight: "500"
    },
    notificationMessage: {
        marginTop: 2,
        fontSize: 13
    }
});
