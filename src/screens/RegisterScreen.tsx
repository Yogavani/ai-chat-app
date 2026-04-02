import React, { useEffect, useRef, useState } from "react";
import { View, TextInput, TouchableOpacity, StyleSheet, Text, Image, ActivityIndicator } from "react-native";
import API from "../services/api";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/navigation";
import { useAppTheme } from "../theme/ThemeContext";
import { Eye, EyeOff } from "lucide-react-native";
import { getUsers } from "../services/userService";

type HomeScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "Register"
>;
type Props = {
    navigation: HomeScreenNavigationProp;
  };
  
const RegisterScreen = ({ navigation } : Props) => {
    const LOADER_PURPLE = "#7423d7";
    const { colors } = useAppTheme();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [isErrorMessage, setIsErrorMessage] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "taken" | "available" | "invalid">("idle");
    const [emailStatus, setEmailStatus] = useState<"idle" | "checking" | "taken" | "available" | "invalid">("idle");
    const usernameCheckSeqRef = useRef(0);
    const emailCheckSeqRef = useRef(0);

    const getPasswordValidationErrors = (value: string) => {
        const errors: string[] = [];
        if (value.length < 8) errors.push("Password must be at least 8 characters.");
        if (!/[A-Z]/.test(value)) errors.push("Password must include at least one uppercase letter.");
        if (!/[0-9]/.test(value)) errors.push("Password must include at least one number.");
        if (!/[^A-Za-z0-9]/.test(value)) errors.push("Password must include at least one special character.");
        return errors;
    };

    useEffect(() => {
        const normalizedName = name.trim();
        if (!normalizedName) {
            setUsernameStatus("idle");
            return;
        }
        if (!/^[a-zA-Z0-9._]{3,20}$/.test(normalizedName)) {
            setUsernameStatus("invalid");
            return;
        }

        setUsernameStatus("checking");
        const currentSeq = ++usernameCheckSeqRef.current;
        const timeout = setTimeout(async () => {
            try {
                const users = await getUsers();
                if (currentSeq !== usernameCheckSeqRef.current) return;

                const requestedUsername = normalizedName.toLowerCase();
                const isTaken = (users || []).some((user: any) => {
                    const existingName = String(user?.name || "").trim().toLowerCase();
                    return existingName === requestedUsername;
                });
                setUsernameStatus(isTaken ? "taken" : "available");
            } catch {
                if (currentSeq !== usernameCheckSeqRef.current) return;
                setUsernameStatus("idle");
            }
        }, 380);

        return () => clearTimeout(timeout);
    }, [name]);

    useEffect(() => {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) {
            setEmailStatus("idle");
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            setEmailStatus("invalid");
            return;
        }

        setEmailStatus("checking");
        const currentSeq = ++emailCheckSeqRef.current;
        const timeout = setTimeout(async () => {
            try {
                const users = await getUsers();
                if (currentSeq !== emailCheckSeqRef.current) return;

                const isTaken = (users || []).some((user: any) => {
                    const existingEmail = String(user?.email || "").trim().toLowerCase();
                    return existingEmail === normalizedEmail;
                });
                setEmailStatus(isTaken ? "taken" : "available");
            } catch {
                if (currentSeq !== emailCheckSeqRef.current) return;
                setEmailStatus("idle");
            }
        }, 380);

        return () => clearTimeout(timeout);
    }, [email]);

    const handleRegister = async () => {
        if (isLoading) return;
        const normalizedName = name.trim();
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedName) {
            setIsErrorMessage(true);
            setMessage("Username is required.");
            return;
        }

        if (!normalizedEmail) {
            setIsErrorMessage(true);
            setMessage("Email is required.");
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            setIsErrorMessage(true);
            setMessage("Please enter a valid email address.");
            return;
        }

        if (!/^[a-zA-Z0-9._]{3,20}$/.test(normalizedName)) {
            setIsErrorMessage(true);
            setMessage("Username must be 3-20 chars and only use letters, numbers, . or _");
            return;
        }
        if (usernameStatus === "checking" || emailStatus === "checking") {
            setIsErrorMessage(true);
            setMessage("Checking username/email availability. Please wait a moment.");
            return;
        }
        if (usernameStatus === "taken") {
            setIsErrorMessage(true);
            setMessage("Username already taken. Please choose a different username.");
            return;
        }
        if (emailStatus === "taken") {
            setIsErrorMessage(true);
            setMessage("Email already exists. Please use another email.");
            return;
        }

        const passwordErrors = getPasswordValidationErrors(password);
        if (passwordErrors.length > 0) {
            setIsErrorMessage(true);
            setMessage(passwordErrors.join("\n"));
            return;
        }

        setIsLoading(true);
        try {
            const existingUsers = await getUsers();
            const requestedUsername = normalizedName.toLowerCase();
            const isUsernameTaken = (existingUsers || []).some((user: any) => {
                const existingName = String(user?.name || "").trim().toLowerCase();
                return existingName === requestedUsername;
            });
            const isEmailTaken = (existingUsers || []).some((user: any) => {
                const existingEmail = String(user?.email || "").trim().toLowerCase();
                return existingEmail === normalizedEmail;
            });

            if (isUsernameTaken) {
                setIsErrorMessage(true);
                setMessage("Username already taken. Please choose a different username.");
                return;
            }
            if (isEmailTaken) {
                setIsErrorMessage(true);
                setMessage("Email already exists. Please use another email.");
                return;
            }

            const response = await API.post("/register", {
                name: normalizedName,
                email: normalizedEmail,
                password,
            });

            console.log("Register response:", response.data);
            setIsErrorMessage(false);
            setMessage("User registered successfully!");
            navigation.navigate("Login")
        } catch (error :any) {

            console.log(error.response?.data || error.message);
            setIsErrorMessage(true);
            const backendMessage =
                error?.response?.data?.message ||
                error?.response?.data?.error ||
                "";
            const normalizedBackendMessage = String(backendMessage).toLowerCase();
            if (
                normalizedBackendMessage.includes("email") &&
                (normalizedBackendMessage.includes("exists") || normalizedBackendMessage.includes("taken"))
            ) {
                setMessage("Email already exists. Please use another email.");
                return;
            }
            if (
                (normalizedBackendMessage.includes("username") || normalizedBackendMessage.includes("name")) &&
                (normalizedBackendMessage.includes("exists") || normalizedBackendMessage.includes("taken"))
            ) {
                setMessage("Username already taken. Please choose a different username.");
                return;
            }
            setMessage(backendMessage || "Registration failed");
        } finally {
            setIsLoading(false);
        };
    }
    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.brandWrap}>
                <Image source={require("../assests/images/chattr_ai_logo.png")} style={styles.brandIcon} />
                <Text style={[styles.brandText, { color: colors.text }]}>Chattr</Text>
            </View>

            <TextInput
                placeholder="Username"
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBackground, color: colors.text }]}
                value={name}
                onChangeText={setName}
                placeholderTextColor={colors.secondaryText}
            />
            {usernameStatus !== "idle" ? (
                <Text
                    style={[
                        styles.inlineValidationText,
                        {
                            color:
                                usernameStatus === "taken" || usernameStatus === "invalid"
                                    ? "#dc2626"
                                    : usernameStatus === "available"
                                      ? "#16a34a"
                                      : colors.secondaryText
                        }
                    ]}
                >
                    {usernameStatus === "checking"
                        ? "Checking username..."
                        : usernameStatus === "taken"
                          ? "Username already taken."
                          : usernameStatus === "available"
                            ? "Username is available."
                            : "Username must be 3-20 chars and only use letters, numbers, . or _"}
                </Text>
            ) : null}

            <TextInput
                placeholder="Email"
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBackground, color: colors.text }]}
                value={email}
                onChangeText={setEmail}
                placeholderTextColor={colors.secondaryText}
            />
            {emailStatus !== "idle" ? (
                <Text
                    style={[
                        styles.inlineValidationText,
                        {
                            color:
                                emailStatus === "taken" || emailStatus === "invalid"
                                    ? "#dc2626"
                                    : emailStatus === "available"
                                      ? "#16a34a"
                                      : colors.secondaryText
                        }
                    ]}
                >
                    {emailStatus === "checking"
                        ? "Checking email..."
                        : emailStatus === "taken"
                          ? "Email already exists."
                          : emailStatus === "available"
                            ? "Email is available."
                            : "Please enter a valid email address."}
                </Text>
            ) : null}

            <View style={[styles.passwordInputWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
                <TextInput
                    placeholder="Password"
                    style={[styles.passwordInput, { color: colors.text }]}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    placeholderTextColor={colors.secondaryText}
                />
                <TouchableOpacity
                    style={styles.eyeButton}
                    activeOpacity={0.8}
                    onPress={() => setShowPassword((prev) => !prev)}
                >
                    {showPassword ? (
                        <EyeOff size={18} color={colors.secondaryText} />
                    ) : (
                        <Eye size={18} color={colors.secondaryText} />
                    )}
                </TouchableOpacity>
            </View>
            <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={handleRegister}
                activeOpacity={0.9}
                disabled={isLoading}
            >
                <View style={styles.primaryButtonContent}>
                    <Text style={styles.primaryButtonText}>Register</Text>
                    {isLoading ? <ActivityIndicator color={LOADER_PURPLE} size="small" style={styles.buttonLoader} /> : null}
                </View>
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
    passwordInputWrap: {
        borderWidth: 1,
        borderRadius: 0,
        marginBottom: 10,
        flexDirection: "row",
        alignItems: "center"
    },
    passwordInput: {
        flex: 1,
        padding: 10
    },
    eyeButton: {
        paddingHorizontal: 10
    },
    message: {
        marginTop: 20,
        textAlign: "center",
        color: "green",
    },
    inlineValidationText: {
        marginTop: -4,
        marginBottom: 8,
        fontSize: 12
    },
    primaryButton: {
        height: 46,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 4
    },
    primaryButtonContent: {
        flexDirection: "row",
        alignItems: "center"
    },
    buttonLoader: {
        marginLeft: 8
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
