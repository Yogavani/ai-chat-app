import React, { useState } from "react";
import { View, TextInput, TouchableOpacity, StyleSheet, Text, Image } from "react-native";
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
    const [isErrorMessage, setIsErrorMessage] = useState(false);

    const getPasswordValidationErrors = (value: string) => {
        const errors: string[] = [];
        if (value.length < 8) errors.push("Password must be at least 8 characters.");
        if (!/[A-Z]/.test(value)) errors.push("Password must include at least one uppercase letter.");
        if (!/[0-9]/.test(value)) errors.push("Password must include at least one number.");
        if (!/[^A-Za-z0-9]/.test(value)) errors.push("Password must include at least one special character.");
        return errors;
    };

    const handleRegister = async () => {
        const passwordErrors = getPasswordValidationErrors(password);
        if (passwordErrors.length > 0) {
            setIsErrorMessage(true);
            setMessage(passwordErrors.join("\n"));
            return;
        }

        try {
            const response = await API.post("/register", {
                name,
                email,
                password,
            });

            console.log("Register response:", response.data);
            setIsErrorMessage(false);
            setMessage("User registered successfully!");
            navigation.navigate("Login")
        } catch (error :any) {

            console.log(error.response?.data || error.message);
            setIsErrorMessage(true);
            setMessage("Registration failed");
        };
    }
    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.brandWrap}>
                <Image source={require("../assests/images/chattr_ai_logo.png")} style={styles.brandIcon} />
                <Text style={[styles.brandText, { color: colors.text }]}>Chattr</Text>
            </View>

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
            <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={handleRegister}
                activeOpacity={0.9}
            >
                <Text style={styles.primaryButtonText}>Register</Text>
            </TouchableOpacity>
            {message ? (
                <Text
                    style={[
                        styles.message,
                        { color: isErrorMessage ? "#dc2626" : colors.primary }
                    ]}
                >
                    {message}
                </Text>
            ) : null}
          <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}
                onPress={() => navigation.navigate("Login")}
                activeOpacity={0.9}
            >
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Go to Login</Text>
            </TouchableOpacity>
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
    brandWrap: {
        alignItems: "center",
        marginBottom: 24
    },
    brandIcon: {
        width: 74,
        height: 74,
        borderRadius: 37,
        marginBottom: 10
    },
    brandText: {
        fontSize: 32,
        fontFamily: "AlfaSlabOne-Regular",
        letterSpacing: 0.8
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
    },
    primaryButton: {
        height: 46,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 4
    },
    primaryButtonText: {
        color: "#ffffff",
        fontSize: 15,
        fontWeight: "700"
    },
    secondaryButton: {
        height: 46,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 12
    },
    secondaryButtonText: {
        fontSize: 14,
        fontWeight: "600"
    }
});
