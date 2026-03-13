import React, { useState } from "react";
import { View, TextInput, Button, StyleSheet, Text } from "react-native";
import API from "../services/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootStackParamList } from "../navigation/navigation";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LoginResponse } from "../services/apiTypes";

type HomeScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "Login"
>;
type Props = {
    navigation: HomeScreenNavigationProp;
    onLoginSuccess: () => void;
  };

const LoginScreen = ({ navigation, onLoginSuccess } : Props) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");

    const handleLogin = async () => {
        try {
            const response = await API.post<LoginResponse>("/login", {
                email,
                password
            });

            console.log("Login response:", response.data);
            const payload: any = response.data;
            const token =
                payload.token ??
                payload.accessToken ??
                payload.data?.token ??
                payload.data?.accessToken;

            if (!token) {
                setMessage("Login failed: token missing in response");
                return;
            }

            await AsyncStorage.setItem("token", token);
            const userId =
                payload.userId ??
                payload.user?.id ??
                payload.data?.userId ??
                payload.data?.user?.id;

            if (typeof userId === "number") {
                await AsyncStorage.setItem("userId", userId.toString());
            }
            onLoginSuccess();

        } catch (error :any) {

            console.log(error.response?.data || error.message);

            setMessage(error.response?.data?.message || "Login failed");

        }
    };

    return (
        <View style={styles.container}>

            <TextInput
                placeholder="Email"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
            />

            <TextInput
                placeholder="Password"
                style={styles.input}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
            />

            <Button title="Login" onPress={handleLogin} />

            {message ? <Text style={styles.message}>{message}</Text> : null}

            <Button
                title="Go to Register"
                onPress={() => navigation.navigate("Register")}
            />
        </View>
    );
};

export default LoginScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        padding: 20
    },
    input: {
        borderWidth: 1,
        marginBottom: 10,
        padding: 10
    },
    message: {
        marginTop: 20,
        textAlign: "center",
        color: "green"
    }
});
