import React from "react";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { StatusBar } from "react-native";
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

    useEffect(() => {
        checkLogin();
    }, []);

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
