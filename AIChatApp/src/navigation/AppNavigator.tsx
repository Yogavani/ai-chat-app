import React from "react";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";


import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import HomeScreen from "../screens/HomeScreen";
import ChatScreen from "../screens/ChatScreen";
import ProfileScreen from "../screens/ProfileScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { RootStackParamList } from "./navigation";
import { useAppTheme } from "../theme/ThemeContext";

const Stack = createNativeStackNavigator<RootStackParamList>();

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
            <Stack.Navigator
                screenOptions={{
                    headerStyle: { backgroundColor: colors.card },
                    headerTintColor: colors.text,
                    headerTitleStyle: { color: colors.text },
                    contentStyle: { backgroundColor: colors.background }
                }}
            >
                {isLoggedIn ? (
                    <>
                        <Stack.Screen name="Home">
                            {(props) => (
                                <HomeScreen {...props} />
                            )}
                        </Stack.Screen>
                        <Stack.Screen name="Chat" component={ChatScreen} />
                        <Stack.Screen name="Profile" component={ProfileScreen} />
                        <Stack.Screen name="Settings">
                            {(props) => (
                                <SettingsScreen
                                    {...props}
                                    onLogoutSuccess={() => setIsLoggedIn(false)}
                                />
                            )}
                        </Stack.Screen>
                    </>
                ) : (
                    <>
                        <Stack.Screen name="Login">
                            {(props) => (
                                <LoginScreen
                                    {...props}
                                    onLoginSuccess={() => setIsLoggedIn(true)}
                                />
                            )}
                        </Stack.Screen>
                        <Stack.Screen name="Register" component={RegisterScreen} />
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>

    );
};

export default AppNavigator;
