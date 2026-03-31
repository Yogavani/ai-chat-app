import React, { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
  Image,
  ActivityIndicator
} from "react-native";
import API from "../services/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootStackParamList } from "../navigation/navigation";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LoginResponse } from "../services/apiTypes";
import { useAppTheme } from "../theme/ThemeContext";
import { Eye, EyeOff } from "lucide-react-native";

type HomeScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "Login"
>;
type Props = {
  navigation: HomeScreenNavigationProp;
  onLoginSuccess: () => void;
};

const LoginScreen = ({ navigation, onLoginSuccess }: Props) => {
  const { colors } = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (isLoading) {
      return;
    }

    setMessage("");
    setIsLoading(true);

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
    } catch (error: any) {
      console.log(error.response?.data || error.message);
      setMessage(error.response?.data?.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.brandWrap}>
        <Image
          source={require("../assests/images/chattr_ai_logo.png")}
          style={styles.brandIcon}
        />
        <Text style={[styles.brandText, { color: colors.text }]}>Chattr</Text>
      </View>

      <TextInput
        placeholder="Email"
        style={[
          styles.input,
          {
            borderColor: colors.border,
            backgroundColor: colors.inputBackground,
            color: colors.text
          }
        ]}
        value={email}
        onChangeText={setEmail}
        placeholderTextColor={colors.secondaryText}
        editable={!isLoading}
      />

      <View style={styles.passwordWrap}>
        <TextInput
          placeholder="Password"
          style={[
            styles.input,
            styles.passwordInput,
            {
              borderColor: colors.border,
              backgroundColor: colors.inputBackground,
              color: colors.text
            }
          ]}
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
          placeholderTextColor={colors.secondaryText}
          editable={!isLoading}
        />
        <TouchableOpacity
          style={styles.passwordEye}
          onPress={() => setShowPassword((prev) => !prev)}
          activeOpacity={0.8}
          disabled={isLoading}
        >
          {showPassword ? (
            <EyeOff size={18} color={colors.secondaryText} strokeWidth={2.2} />
          ) : (
            <Eye size={18} color={colors.secondaryText} strokeWidth={2.2} />
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: colors.primary },
          isLoading ? styles.buttonDisabled : null
        ]}
        onPress={handleLogin}
        activeOpacity={0.9}
        disabled={isLoading}
      >
        <Text style={styles.primaryButtonText}>Login</Text>
      </TouchableOpacity>

      {message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}

      <TouchableOpacity
        style={[
          styles.secondaryButton,
          { borderColor: colors.border, backgroundColor: colors.inputBackground },
          isLoading ? styles.buttonDisabled : null
        ]}
        onPress={() => navigation.navigate("Register")}
        activeOpacity={0.9}
        disabled={isLoading}
      >
        <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Go to Register</Text>
      </TouchableOpacity>

      {isLoading ? (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}
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
  passwordWrap: {
    position: "relative"
  },
  passwordInput: {
    paddingRight: 42
  },
  passwordEye: {
    position: "absolute",
    right: 12,
    top: 12
  },
  message: {
    marginTop: 20,
    textAlign: "center",
    color: "green"
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
  },
  buttonDisabled: {
    opacity: 0.7
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.12)"
  }
});
