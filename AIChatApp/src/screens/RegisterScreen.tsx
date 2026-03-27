import React, { useState } from "react";
import { View, TextInput, Button, StyleSheet, Text } from "react-native";
import API from "../services/api";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/navigation";
import { useAppTheme } from "../theme/ThemeContext";

type HomeScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "Register"
>;
type Props = {
    navigation: HomeScreenNavigationProp;
  };
  
const RegisterScreen = ({ navigation } : Props) => {
    const { colors } = useAppTheme();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const handleRegister = async () => {
        try {
            const response = await API.post("/register", {
                name,
                email,
                password,
            });

            console.log("Register response:", response.data);
            setMessage("User registered successfully!");
            navigation.navigate("Login")
        } catch (error :any) {

            console.log(error.response?.data || error.message);
            setMessage("Registration failed");
        };
    }
    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>

            <TextInput
                placeholder="Name"
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBackground, color: colors.text }]}
                value={name}
                onChangeText={setName}
                placeholderTextColor={colors.secondaryText}
            />

            <TextInput
                placeholder="Email"
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBackground, color: colors.text }]}
                value={email}
                onChangeText={setEmail}
                placeholderTextColor={colors.secondaryText}
            />

            <TextInput
                placeholder="Password"
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBackground, color: colors.text }]}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholderTextColor={colors.secondaryText}
            />
            <Button title="Register" onPress={handleRegister} />
            {message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}
          <View style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
          <Button
                title="Go to Login"
                onPress={() => navigation.navigate("Login")}
            />
          </View>
        </View>
    );
};

export default RegisterScreen;

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
        color: "green",
    }
});
