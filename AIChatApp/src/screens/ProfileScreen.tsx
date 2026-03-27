import React, { useCallback, useState } from "react";
import { Image, StyleSheet, Switch, Text, View } from "react-native";
import { RouteProp, useFocusEffect } from "@react-navigation/native";
import { RootStackParamList } from "../navigation/navigation";
import { useAppTheme } from "../theme/ThemeContext";
import { getUsers } from "../services/userService";
import { toAbsoluteImageUrl } from "../utils/image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AI_FEATURE_DEFAULTS, AI_FEATURE_KEYS } from "../constants/aiFeatures";

type ProfileRouteProp = RouteProp<RootStackParamList, "Profile">;

type Props = {
  route: ProfileRouteProp;
};

const ProfileScreen = ({ route }: Props) => {
  const { colors } = useAppTheme();
  const {
    userId,
    userName,
    userEmail,
    profileImage,
    about = "Hey there! I am using AIChatApp."
  } = route.params;
  const [displayName, setDisplayName] = useState(userName);
  const [displayEmail, setDisplayEmail] = useState(userEmail || "");
  const [displayAbout, setDisplayAbout] = useState(about);
  const [displayProfileImage, setDisplayProfileImage] = useState(
    toAbsoluteImageUrl(profileImage || "")
  );
  const [autoReplyEnabled, setAutoReplyEnabled] = useState<boolean>(
    AI_FEATURE_DEFAULTS.autoReply
  );
  const [suggestionsEnabled, setSuggestionsEnabled] = useState<boolean>(
    AI_FEATURE_DEFAULTS.suggestions
  );
  const [rewriteEnabled, setRewriteEnabled] = useState<boolean>(
    AI_FEATURE_DEFAULTS.rewrite
  );

  useFocusEffect(
    useCallback(() => {
      const refreshProfile = async () => {
        try {
          const users = await getUsers();
          const matchedUser = users.find((item: any) => item.id === userId);
          if (!matchedUser) return;

          setDisplayName(matchedUser.name || userName);
          setDisplayEmail(matchedUser.email || userEmail || "");
          setDisplayAbout(
            matchedUser.about || matchedUser.bio || about || "Hey there! I am using AIChatApp."
          );
          setDisplayProfileImage(
            toAbsoluteImageUrl(
              matchedUser.profileImage ??
                matchedUser.avatar ??
                matchedUser.profile_pic ??
                profileImage ??
                ""
            )
          );
        } catch (error) {
          console.log("Refresh profile error:", error);
        }
      };

      refreshProfile();

      const loadAIFeatures = async () => {
        const [autoReplyByUserValue, suggestionsByUserValue, rewriteByUserValue] = await Promise.all([
          AsyncStorage.getItem(AI_FEATURE_KEYS.autoReplyByUser),
          AsyncStorage.getItem(AI_FEATURE_KEYS.suggestionsByUser),
          AsyncStorage.getItem(AI_FEATURE_KEYS.rewriteByUser)
        ]);

        if (autoReplyByUserValue) {
          try {
            const parsed = JSON.parse(autoReplyByUserValue) as Record<string, boolean>;
            const contactValue = parsed[String(userId)];
            if (typeof contactValue === "boolean") {
              setAutoReplyEnabled(contactValue);
            }
          } catch (error) {
            console.log("Parse autoReplyByUser error:", error);
          }
        }
        if (suggestionsByUserValue) {
          try {
            const parsed = JSON.parse(suggestionsByUserValue) as Record<string, boolean>;
            const contactValue = parsed[String(userId)];
            if (typeof contactValue === "boolean") {
              setSuggestionsEnabled(contactValue);
            } else {
              setSuggestionsEnabled(AI_FEATURE_DEFAULTS.suggestions);
            }
          } catch (error) {
            setSuggestionsEnabled(AI_FEATURE_DEFAULTS.suggestions);
          }
        } else {
          setSuggestionsEnabled(AI_FEATURE_DEFAULTS.suggestions);
        }

        if (rewriteByUserValue) {
          try {
            const parsed = JSON.parse(rewriteByUserValue) as Record<string, boolean>;
            const contactValue = parsed[String(userId)];
            if (typeof contactValue === "boolean") {
              setRewriteEnabled(contactValue);
            } else {
              setRewriteEnabled(AI_FEATURE_DEFAULTS.rewrite);
            }
          } catch (error) {
            setRewriteEnabled(AI_FEATURE_DEFAULTS.rewrite);
          }
        } else {
          setRewriteEnabled(AI_FEATURE_DEFAULTS.rewrite);
        }
      };

      loadAIFeatures();
    }, [about, profileImage, userEmail, userId, userName])
  );

  const updateToggleByUser = async (
    key: string,
    value: boolean,
    setter: (next: boolean) => void
  ) => {
    setter(value);
    const existing = await AsyncStorage.getItem(key);
    let map: Record<string, boolean> = {};
    if (existing) {
      try {
        map = JSON.parse(existing) as Record<string, boolean>;
      } catch (error) {
        map = {};
      }
    }
    map[String(userId)] = value;
    await AsyncStorage.setItem(key, JSON.stringify(map));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
        {displayProfileImage ? (
          <Image source={{ uri: displayProfileImage }} style={styles.avatarImage} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.chipBackground }]}>
            <Text style={[styles.avatarInitial, { color: colors.primary }]}>
              {displayName?.trim()?.charAt(0)?.toUpperCase() || "?"}
            </Text>
          </View>
        )}

        <Text style={[styles.userName, { color: colors.text }]}>{displayName}</Text>
        {displayEmail ? (
          <Text style={[styles.userEmail, { color: colors.secondaryText }]}>{displayEmail}</Text>
        ) : null}
      </View>

      <View style={[styles.aboutCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.label, { color: colors.secondaryText }]}>About</Text>
        <Text style={[styles.aboutText, { color: colors.text }]}>{displayAbout}</Text>
      </View>

      <View style={[styles.aboutCard, { backgroundColor: colors.card, marginTop: 12 }]}>
        <Text style={[styles.label, { color: colors.secondaryText }]}>AI Features</Text>

        {userId !== 9999 ? (
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleText, { color: colors.text }]}>Auto Reply</Text>
            <Switch
              value={autoReplyEnabled}
              onValueChange={(value) =>
                updateToggleByUser(AI_FEATURE_KEYS.autoReplyByUser, value, setAutoReplyEnabled)
              }
              thumbColor={autoReplyEnabled ? colors.primary : "#d1d5db"}
              trackColor={{ false: "#6b7280", true: `${colors.primary}66` }}
            />
          </View>
        ) : null}

        <View style={styles.toggleRow}>
          <Text style={[styles.toggleText, { color: colors.text }]}>AI Suggestions</Text>
          <Switch
            value={suggestionsEnabled}
            onValueChange={(value) =>
              updateToggleByUser(
                AI_FEATURE_KEYS.suggestionsByUser,
                value,
                setSuggestionsEnabled
              )
            }
            thumbColor={suggestionsEnabled ? colors.primary : "#d1d5db"}
            trackColor={{ false: "#6b7280", true: `${colors.primary}66` }}
          />
        </View>

        <View style={styles.toggleRow}>
          <Text style={[styles.toggleText, { color: colors.text }]}>Rewrite Message</Text>
          <Switch
            value={rewriteEnabled}
            onValueChange={(value) =>
              updateToggleByUser(AI_FEATURE_KEYS.rewriteByUser, value, setRewriteEnabled)
            }
            thumbColor={rewriteEnabled ? colors.primary : "#d1d5db"}
            trackColor={{ false: "#6b7280", true: `${colors.primary}66` }}
          />
        </View>
      </View>
    </View>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    padding: 16
  },
  profileCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 14
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 12
  },
  avatarFallback: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12
  },
  avatarInitial: {
    fontSize: 44,
    fontWeight: "700",
    color: "#1d4ed8"
  },
  userName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827"
  },
  userEmail: {
    marginTop: 4,
    fontSize: 14,
    color: "#6b7280"
  },
  aboutCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16
  },
  label: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 8
  },
  aboutText: {
    fontSize: 16,
    color: "#111827"
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8
  },
  toggleText: {
    fontSize: 15,
    fontWeight: "600"
  }
});
