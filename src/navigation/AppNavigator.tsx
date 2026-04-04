import React from "react";
import { DarkTheme, DefaultTheme, NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import notifee, { EventType } from "@notifee/react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import {
    AppState,
    AppStateStatus,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Image
} from "react-native";
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
import API from "../services/api";
import { getUsers } from "../services/userService";
import { toAbsoluteImageUrl } from "../utils/image";
import { subscribeFcmTokenRefresh, syncFcmTokenForUser } from "../services/pushNotifications";
import {
    setAnalyticsUserId,
    trackAppSession,
    trackEvent,
    trackNotificationOpened,
    trackPageTime
} from "../services/analytics";

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
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    const [activeChatUserId, setActiveChatUserId] = useState<number | null>(null);
    const [notificationBanner, setNotificationBanner] = useState<{
        senderId: number;
        notificationId?: string;
        title: string;
        preview: string;
        profileImage?: string;
        sentAt?: string | number | null;
    } | null>(null);
    const [failedNotificationImageSenders, setFailedNotificationImageSenders] = useState<number[]>([]);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastIncomingBySenderRef = useRef<Map<number, number>>(new Map());
    const senderProfileByIdRef = useRef<Map<number, string>>(new Map());
    const lastTrackedRouteRef = useRef<string>("");
    const routeOpenedAtRef = useRef<number | null>(null);
    const appSessionStartedAtRef = useRef<number | null>(null);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const navigationRef = useNavigationContainerRef<RootStackParamList>();
    const { resolvedTheme, colors } = useAppTheme();

    const flushCurrentRouteTime = () => {
        const previousRoute = lastTrackedRouteRef.current;
        const openedAt = routeOpenedAtRef.current;
        if (!previousRoute || !openedAt) return;

        const durationSeconds = (Date.now() - openedAt) / 1000;
        if (durationSeconds >= 1) {
            void trackPageTime(previousRoute, durationSeconds);
        }
    };

    const checkLogin = async () => {
        const token = await AsyncStorage.getItem("token");
        const storedUserId = await AsyncStorage.getItem("userId");
        const parsedUserId = storedUserId ? Number(storedUserId) : null;
        setCurrentUserId(parsedUserId && !Number.isNaN(parsedUserId) ? parsedUserId : null);

        if (token) {
            setIsLoggedIn(true);
        } else {
            setIsLoggedIn(false);
        }
    };

    useEffect(() => {
        void checkLogin();
    }, []);

    useEffect(() => {
        void trackEvent("app_open");
    }, []);

    useEffect(() => {
        void setAnalyticsUserId(currentUserId);
    }, [currentUserId]);

    useEffect(() => {
        if (!isLoggedIn || !currentUserId) {
            flushCurrentRouteTime();
            routeOpenedAtRef.current = null;
            lastTrackedRouteRef.current = "";
            if (appSessionStartedAtRef.current) {
                const durationSeconds = (Date.now() - appSessionStartedAtRef.current) / 1000;
                void trackAppSession("end", durationSeconds);
                appSessionStartedAtRef.current = null;
            }
            return;
        }

        appSessionStartedAtRef.current = Date.now();
        void trackAppSession("start");
    }, [isLoggedIn, currentUserId]);

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (nextState) => {
            const prevState = appStateRef.current;
            appStateRef.current = nextState;

            if (!isLoggedIn || !currentUserId) return;

            if (
                prevState === "active" &&
                (nextState === "background" || nextState === "inactive")
            ) {
                flushCurrentRouteTime();
                if (appSessionStartedAtRef.current) {
                    const durationSeconds = (Date.now() - appSessionStartedAtRef.current) / 1000;
                    void trackAppSession("end", durationSeconds);
                    appSessionStartedAtRef.current = null;
                }
                return;
            }

            if (
                (prevState === "background" || prevState === "inactive") &&
                nextState === "active"
            ) {
                routeOpenedAtRef.current = Date.now();
                appSessionStartedAtRef.current = Date.now();
                void trackAppSession("start");
            }
        });

        return () => {
            subscription.remove();
        };
    }, [isLoggedIn, currentUserId]);

    useEffect(() => {
        return () => {
            flushCurrentRouteTime();
            if (appSessionStartedAtRef.current) {
                const durationSeconds = (Date.now() - appSessionStartedAtRef.current) / 1000;
                void trackAppSession("end", durationSeconds);
                appSessionStartedAtRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!isLoggedIn || !currentUserId) return;

        let unsubscribeRefresh: (() => void) | null = null;
        let isCancelled = false;

        const initFcmSync = async () => {
            await syncFcmTokenForUser(currentUserId);
            if (isCancelled) return;
            unsubscribeRefresh = subscribeFcmTokenRefresh(currentUserId);
        };

        void initFcmSync();

        return () => {
            isCancelled = true;
            if (unsubscribeRefresh) unsubscribeRefresh();
        };
    }, [isLoggedIn, currentUserId]);

    useEffect(() => {
        if (!isLoggedIn || !currentUserId) return;

        const onConnect = () => {
            socket.emit("join", currentUserId);
        };

        const onNewMessage = (payload: any) => {
            const receiverId = Number(payload?.receiver_id);
            const senderId = Number(payload?.sender_id);

            if (!receiverId || !senderId) return;
            if (receiverId !== currentUserId) return;
            void trackEvent("message_received", {
                source: "socket",
                sender_id: senderId,
                has_text: String(payload?.message || "").trim().length > 0
            });
            if (senderId === 9999999) return;
            if (activeChatUserId === senderId) return;

            const textPreview = String(payload?.message || "").trim();
            const payloadProfileImage = toAbsoluteImageUrl(
                payload?.sender_profile_image ?? payload?.senderProfileImage ?? payload?.profileImage ?? ""
            );
            const knownProfileImage = senderProfileByIdRef.current.get(senderId) || "";
            void trackEvent("notification_received", {
                source: "in_app_banner",
                sender_id: senderId
            });
            setNotificationBanner({
                senderId,
                notificationId: String(payload?.id ?? "").trim() || undefined,
                title: String(payload?.sender_name || payload?.senderName || "New message"),
                preview: textPreview || "You have a new message",
                profileImage: payloadProfileImage || knownProfileImage || undefined,
                sentAt: payload?.created_at ?? payload?.updated_at ?? Date.now()
            });
        };

        socket.on("connect", onConnect);
        socket.on("new-message", onNewMessage);

        if (socket.connected) {
            onConnect();
        } else {
            ensureSocketConnection();
        }

        return () => {
            socket.off("connect", onConnect);
            socket.off("new-message", onNewMessage);
        };
    }, [isLoggedIn, currentUserId, activeChatUserId]);

    useEffect(() => {
        lastIncomingBySenderRef.current.clear();
        senderProfileByIdRef.current.clear();
        setFailedNotificationImageSenders([]);
    }, [currentUserId]);

    const formatBannerTime = (rawTime?: string | number | null) => {
        if (!rawTime) return "";
        const parsedDate = new Date(rawTime);
        if (Number.isNaN(parsedDate.getTime())) return "";
        return parsedDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    };

    useEffect(() => {
        if (!isLoggedIn || !currentUserId) return;

        let isMounted = true;

        const readLatestIncoming = async () => {
            try {
                const allUsers = await getUsers();
                const contacts = (allUsers || []).filter((user: any) => Number(user?.id) !== currentUserId);
                contacts.forEach((user: any) => {
                    const userId = Number(user?.id);
                    if (!userId || Number.isNaN(userId)) return;
                    const image = toAbsoluteImageUrl(user?.profileImage ?? user?.avatar ?? user?.profile_pic ?? "");
                    if (image) senderProfileByIdRef.current.set(userId, image);
                });

                await Promise.all(
                    contacts.map(async (user: any) => {
                        const userId = Number(user?.id);
                        if (!userId || Number.isNaN(userId)) return;

                        const response = await API.get(`/receive-message/${currentUserId}/${userId}`);
                        const conversation = Array.isArray(response.data) ? response.data : [];
                        const latestIncoming = [...conversation]
                            .reverse()
                            .find(
                                (item: any) =>
                                    Number(item?.sender_id) === userId &&
                                    Number(item?.receiver_id) === currentUserId
                            );
                        if (!latestIncoming) return;

                        const latestId = Number(latestIncoming?.id);
                        if (!latestId || Number.isNaN(latestId)) return;

                        const previousId = lastIncomingBySenderRef.current.get(userId);
                        lastIncomingBySenderRef.current.set(userId, latestId);

                        if (previousId === undefined) return;
                        if (latestId <= previousId) return;
                        void trackEvent("message_received", {
                            source: "polling",
                            sender_id: userId,
                            has_text: String(latestIncoming?.message || "").trim().length > 0
                        });
                        if (activeChatUserId === userId) return;
                        if (!isMounted) return;

                        void trackEvent("notification_received", {
                            source: "in_app_banner_polling",
                            sender_id: userId
                        });
                        setNotificationBanner({
                            senderId: userId,
                            notificationId: String(latestIncoming?.id ?? "").trim() || undefined,
                            title: String(user?.name || "New message"),
                            preview: String(latestIncoming?.message || "You have a new message"),
                            profileImage: toAbsoluteImageUrl(
                                user?.profileImage ?? user?.avatar ?? user?.profile_pic ?? ""
                            ),
                            sentAt: latestIncoming?.created_at ?? latestIncoming?.updated_at ?? Date.now()
                        });
                    })
                );
            } catch {
                // noop: notification polling should never block app usage
            }
        };

        void readLatestIncoming();
        const interval = setInterval(() => {
            void readLatestIncoming();
        }, 7000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [isLoggedIn, currentUserId, activeChatUserId]);

    useEffect(() => {
        if (!notificationBanner) return;
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
            setNotificationBanner(null);
            hideTimerRef.current = null;
        }, 4000);

        return () => {
            if (hideTimerRef.current) {
                clearTimeout(hideTimerRef.current);
                hideTimerRef.current = null;
            }
        };
    }, [notificationBanner]);

    useEffect(() => {
        const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
            if (type !== EventType.PRESS && type !== EventType.ACTION_PRESS) return;
            const senderId = Number(detail.notification?.data?.senderId || 0);
            const notificationId =
                String(
                    detail.notification?.data?.notificationId ??
                        detail.notification?.id ??
                        ""
                ).trim() || undefined;
            void trackEvent("notification_opened", {
                source: "foreground_push",
                sender_id: senderId > 0 ? senderId : undefined
            });
            void trackNotificationOpened(notificationId);
        });

        return unsubscribe;
    }, []);

    if (isLoggedIn === null) {
        return null;
    }

    return (
        <NavigationContainer
            ref={navigationRef}
            onReady={() => {
                const initialRoute = navigationRef.getCurrentRoute();
                if (initialRoute?.name) {
                    lastTrackedRouteRef.current = initialRoute.name;
                    routeOpenedAtRef.current = Date.now();
                }
            }}
            onStateChange={() => {
                const route = navigationRef.getCurrentRoute();
                if (route?.name === "Chat") {
                    const receiverId = Number((route.params as any)?.receiverId);
                    setActiveChatUserId(Number.isNaN(receiverId) ? null : receiverId);
                } else {
                    setActiveChatUserId(null);
                }

                if (route?.name && lastTrackedRouteRef.current !== route.name) {
                    flushCurrentRouteTime();
                    lastTrackedRouteRef.current = route.name;
                    routeOpenedAtRef.current = Date.now();
                    void trackEvent("screen_viewed", { screen_name: route.name });
                }
            }}
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
                                <MainTabs
                                    onLogoutSuccess={() => {
                                        setIsLoggedIn(false);
                                        setCurrentUserId(null);
                                        setNotificationBanner(null);
                                    }}
                                />
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
                                    onLoginSuccess={() => {
                                        void checkLogin();
                                    }}
                                />
                            )}
                        </Stack.Screen>
                        <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
                    </>
                )}
            </Stack.Navigator>
            {isLoggedIn && notificationBanner ? (
                <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                        void trackEvent("notification_opened", {
                            source: "in_app_banner",
                            sender_id: notificationBanner.senderId
                        });
                        void trackNotificationOpened(notificationBanner.notificationId);
                        setNotificationBanner(null);
                        navigationRef.navigate("Chat", {
                            receiverId: notificationBanner.senderId,
                            receiverName: notificationBanner.title
                        });
                    }}
                    style={[
                        styles.inAppNotification,
                        {
                            backgroundColor: colors.card,
                            borderColor: colors.border
                        }
                    ]}
                >
                    <View style={styles.inAppNotificationRow}>
                        {notificationBanner.profileImage &&
                        !failedNotificationImageSenders.includes(notificationBanner.senderId) ? (
                            <Image
                                source={{ uri: notificationBanner.profileImage }}
                                style={styles.inAppNotificationAvatar}
                                onError={() =>
                                    setFailedNotificationImageSenders((prev) =>
                                        prev.includes(notificationBanner.senderId)
                                            ? prev
                                            : [...prev, notificationBanner.senderId]
                                    )
                                }
                            />
                        ) : (
                            <View style={[styles.inAppNotificationAvatarFallback, { backgroundColor: colors.primary }]}>
                                <Text style={styles.inAppNotificationAvatarInitial}>
                                    {notificationBanner.title?.trim()?.charAt(0)?.toUpperCase() || "?"}
                                </Text>
                            </View>
                        )}

                        <View style={styles.inAppNotificationTextWrap}>
                            <View style={styles.inAppNotificationTopLine}>
                                <Text style={[styles.inAppNotificationTitle, { color: colors.text }]} numberOfLines={1}>
                                    {notificationBanner.title}
                                </Text>
                                <Text style={[styles.inAppNotificationTime, { color: colors.secondaryText }]}>
                                    {formatBannerTime(notificationBanner.sentAt)}
                                </Text>
                            </View>
                            <Text
                                style={[styles.inAppNotificationPreview, { color: colors.secondaryText }]}
                                numberOfLines={1}
                            >
                                {notificationBanner.preview}
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>
            ) : null}
        </NavigationContainer>

    );
};

export default AppNavigator;

const styles = StyleSheet.create({
    inAppNotification: {
        position: "absolute",
        top: 10,
        left: 12,
        right: 12,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        zIndex: 20,
        elevation: 4
    },
    inAppNotificationRow: {
        flexDirection: "row",
        alignItems: "center"
    },
    inAppNotificationAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 10
    },
    inAppNotificationAvatarFallback: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 10,
        alignItems: "center",
        justifyContent: "center"
    },
    inAppNotificationAvatarInitial: {
        color: "#ffffff",
        fontWeight: "700",
        fontSize: 16
    },
    inAppNotificationTextWrap: {
        flex: 1
    },
    inAppNotificationTopLine: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center"
    },
    inAppNotificationTitle: {
        fontSize: 14,
        fontWeight: "700",
        flex: 1,
        marginRight: 8
    },
    inAppNotificationTime: {
        fontSize: 12
    },
    inAppNotificationPreview: {
        marginTop: 2,
        fontSize: 13
    }
});
