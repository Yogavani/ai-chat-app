import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../navigation/navigation";
import { useAppTheme } from "../theme/ThemeContext";

type ProfileRouteProp = RouteProp<RootStackParamList, "Profile">;

type Props = {
  route: ProfileRouteProp;
};

const ProfileScreen = ({ route }: Props) => {
  const { colors } = useAppTheme();
  const {
    userName,
    userEmail,
    profileImage,
    about = "Hey there! I am using AIChatApp."
  } = route.params;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
        {profileImage ? (
          <Image source={{ uri: profileImage }} style={styles.avatarImage} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.chipBackground }]}>
            <Text style={[styles.avatarInitial, { color: colors.primary }]}>
              {userName?.trim()?.charAt(0)?.toUpperCase() || "?"}
            </Text>
          </View>
        )}

        <Text style={[styles.userName, { color: colors.text }]}>{userName}</Text>
        {userEmail ? (
          <Text style={[styles.userEmail, { color: colors.secondaryText }]}>{userEmail}</Text>
        ) : null}
      </View>

      <View style={[styles.aboutCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.label, { color: colors.secondaryText }]}>About</Text>
        <Text style={[styles.aboutText, { color: colors.text }]}>{about}</Text>
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
  }
});
