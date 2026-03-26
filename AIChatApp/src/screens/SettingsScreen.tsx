import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getUsers } from "../services/userService";
import API from "../services/api";
import { launchImageLibrary } from "react-native-image-picker";
import { useAppTheme } from "../theme/ThemeContext";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/navigation";

type LanguageOption = "English" | "Hindi" | "Tamil";

const LANGUAGE_KEY = "appLanguage";
const PROFILE_IMAGE_KEY = "profileImage";

type SettingsNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "Settings"
>;

type Props = {
  navigation: SettingsNavigationProp;
  onLogoutSuccess: () => void;
};

const SettingsScreen = ({ onLogoutSuccess }: Props) => {
  const { themePreference, setThemePreference, colors } = useAppTheme();
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [profileName, setProfileName] = useState("User");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileAbout, setProfileAbout] = useState("Hey there! I am using AIChatApp.");
  const [profileImage, setProfileImage] = useState("");
  const [language, setLanguage] = useState<LanguageOption>("English");

  useEffect(() => {
    loadSettings();
  }, []);

  const avatarInitial = useMemo(() => {
    return profileName?.trim()?.charAt(0)?.toUpperCase() || "?";
  }, [profileName]);

  const toAbsoluteImageUrl = (value?: string | null) => {
    if (!value) return "";
    if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("file://")) {
      return value;
    }
    const base = API.defaults.baseURL || "";
    return `${base}${value.startsWith("/") ? value : `/${value}`}`;
  };

  const loadSettings = async () => {
    try {
      const [storedUserId, storedLanguage, storedProfileImage] =
        await Promise.all([
          AsyncStorage.getItem("userId"),
          AsyncStorage.getItem(LANGUAGE_KEY),
          AsyncStorage.getItem(PROFILE_IMAGE_KEY)
        ]);

      const parsedUserId = storedUserId ? Number(storedUserId) : null;
      if (parsedUserId && !Number.isNaN(parsedUserId)) {
        setCurrentUserId(parsedUserId);
      }

      if (storedLanguage === "English" || storedLanguage === "Hindi" || storedLanguage === "Tamil") {
        setLanguage(storedLanguage);
      }

      if (storedProfileImage) {
        setProfileImage(toAbsoluteImageUrl(storedProfileImage));
      }

      if (parsedUserId && !Number.isNaN(parsedUserId)) {
        const users = await getUsers();
        const me = users.find((item: any) => item.id === parsedUserId);
        if (me) {
          setProfileName(me.name || "User");
          setProfileEmail(me.email || "");
          setProfileAbout(me.about || me.bio || "Hey there! I am using AIChatApp.");

          const remoteImage =
            me.profileImage ?? me.avatar ?? me.profile_pic ?? storedProfileImage ?? "";
          if (remoteImage) {
            setProfileImage(toAbsoluteImageUrl(remoteImage));
          }
        }
      }
    } catch (error) {
      console.log("Load settings error:", error);
    }
  };

  const saveLanguage = async (value: LanguageOption) => {
    setLanguage(value);
    await AsyncStorage.setItem(LANGUAGE_KEY, value);
  };

  const pickProfileImage = async () => {
    const showPermissionSettingsModal = () => {
      Alert.alert(
        "Permission needed",
        "Please allow Photos access in Settings.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => {
              Linking.openSettings().catch(() => {
                Alert.alert("Error", "Unable to open app settings.");
              });
            }
          }
        ]
      );
    };

    const openPicker = async () => {
      const result = await launchImageLibrary({
        mediaType: "photo",
        selectionLimit: 1,
        includeBase64: true,
        quality: 0.9
      });

      if (result.didCancel) return;

      if (result.errorCode) {
        if (result.errorCode === "permission") {
          showPermissionSettingsModal();
          return;
        }
        Alert.alert("Error", result.errorMessage || "Unable to open gallery.");
        return;
      }

      const selectedAsset = result.assets?.[0];
      const base64Data = selectedAsset?.base64;
      const mimeType = selectedAsset?.type || "image/png";

      if (!base64Data) {
        Alert.alert("Error", "No image selected.");
        return;
      }

      if (!currentUserId) {
        Alert.alert("Error", "User not found. Please login again.");
        return;
      }

      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      const endpoint = `/upload-profile-image/${currentUserId}`;
      const payloadCandidates = [
        { image: dataUrl },
        { imageData: dataUrl },
        { imageBase64: dataUrl },
        { profileImage: dataUrl },
        { base64: dataUrl }
      ];

      let response: any = null;
      let lastError: any = null;
      for (const payload of payloadCandidates) {
        try {
          response = await API.post(endpoint, payload);
          if (response?.status >= 200 && response?.status < 300) {
            break;
          }
        } catch (err: any) {
          lastError = err;
        }
      }

      if (!response) {
        const message =
          lastError?.response?.data?.message ||
          lastError?.response?.data?.error ||
          lastError?.message ||
          "Upload failed with status 400.";
        Alert.alert("Upload Failed", message);
        return;
      }

      const returnedUrl =
        response?.data?.imageUrl ??
        response?.data?.data?.imageUrl ??
        response?.data?.profileImage ??
        response?.data?.data?.profileImage ??
        "";

      if (!returnedUrl) {
        console.log("Upload response missing image URL:", response?.data);
        Alert.alert("Error", "Upload succeeded but image URL not returned by backend.");
        return;
      }

      const absoluteImageUrl = toAbsoluteImageUrl(returnedUrl);
      setProfileImage(absoluteImageUrl);
      await AsyncStorage.setItem(PROFILE_IMAGE_KEY, absoluteImageUrl);
      Alert.alert("Updated", "Profile image updated successfully.");
    };

    try {
      if (Platform.OS === "android") {
        const permission =
          Platform.Version >= 33
            ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
            : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

        const currentStatus = await PermissionsAndroid.check(permission);
        if (currentStatus) {
          await openPicker();
          return;
        }

        const requested = await PermissionsAndroid.request(permission);
        if (requested === PermissionsAndroid.RESULTS.GRANTED) {
          await openPicker();
          return;
        }

        showPermissionSettingsModal();
        return;
      }

      await openPicker();
    } catch (error: any) {
      console.log("Image picker/upload error:", error?.response?.data || error);
      Alert.alert(
        "Error",
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          "Failed to upload profile image."
      );
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This action is permanent. Do you want to continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (currentUserId) {
                await API.delete(`/delete-account/${currentUserId}`);
              }
              await AsyncStorage.multiRemove(["token", "userId"]);
              Alert.alert("Done", "Account deleted. Please restart app.");
            } catch (error: any) {
              Alert.alert(
                "Not Completed",
                error?.response?.data?.message ||
                  "Delete API is not configured yet on backend."
              );
            }
          }
        }
      ]
    );
  };

  const openHelpFeedback = () => {
    Alert.alert(
      "Help & Feedback",
      "Share issues or suggestions at support@aichatapp.com"
    );
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(["token", "userId"]);
    onLogoutSuccess();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.avatarWrap}>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{avatarInitial}</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.plusButton}
            onPress={pickProfileImage}
          >
            <Text style={styles.plusButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.nameText, { color: colors.text }]}>{profileName}</Text>
        {profileEmail ? (
          <Text style={[styles.emailText, { color: colors.secondaryText }]}>{profileEmail}</Text>
        ) : null}
        <Text style={[styles.aboutText, { color: colors.secondaryText }]}>{profileAbout}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Theme</Text>
        <View style={styles.optionRow}>
          {(["light", "dark"] as const).map((item) => (
            <TouchableOpacity
              key={item}
              style={[
                styles.chip,
                { borderColor: colors.border, backgroundColor: colors.card },
                themePreference === item
                  ? [styles.chipActive, { backgroundColor: colors.primary, borderColor: colors.primary }]
                  : null
              ]}
              onPress={() => setThemePreference(item)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: colors.secondaryText },
                  themePreference === item ? styles.chipTextActive : null
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: colors.text }]}>
          App Language
        </Text>
        <View style={styles.optionRow}>
          {(["English", "Hindi", "Tamil"] as LanguageOption[]).map((item) => (
            <TouchableOpacity
              key={item}
              style={[
                styles.chip,
                { borderColor: colors.border, backgroundColor: colors.card },
                language === item
                  ? [styles.chipActive, { backgroundColor: colors.primary, borderColor: colors.primary }]
                  : null
              ]}
              onPress={() => saveLanguage(item)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: colors.secondaryText },
                  language === item ? styles.chipTextActive : null
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <TouchableOpacity style={styles.actionRow} onPress={openHelpFeedback}>
          <Text style={[styles.actionText, { color: colors.text }]}>Help & Feedback</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionRow, styles.deleteRow, { borderTopColor: colors.border }]}
          onPress={handleDeleteAccount}
        >
          <Text style={[styles.deleteText, { color: colors.danger }]}>Delete Account</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionRow, styles.deleteRow, { borderTopColor: colors.border }]}
          onPress={handleLogout}
        >
          <Text style={[styles.actionText, { color: colors.text }]}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6"
  },
  content: {
    padding: 16,
    gap: 12
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16
  },
  avatarWrap: {
    alignSelf: "center",
    marginBottom: 12
  },
  avatarImage: {
    width: 110,
    height: 110,
    borderRadius: 55
  },
  avatarFallback: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarInitial: {
    fontSize: 42,
    fontWeight: "700",
    color: "#1d4ed8"
  },
  plusButton: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff"
  },
  plusButtonText: {
    color: "#ffffff",
    fontSize: 20,
    lineHeight: 21,
    fontWeight: "700"
  },
  nameText: {
    fontSize: 21,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center"
  },
  emailText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
    textAlign: "center"
  },
  aboutText: {
    fontSize: 14,
    color: "#374151",
    marginTop: 10,
    textAlign: "center"
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10
  },
  sectionSpacing: {
    marginTop: 16
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  chipActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb"
  },
  chipText: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "600"
  },
  chipTextActive: {
    color: "#ffffff"
  },
  actionRow: {
    paddingVertical: 12
  },
  actionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f2937"
  },
  deleteRow: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    marginTop: 2
  },
  deleteText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#dc2626"
  }
});
