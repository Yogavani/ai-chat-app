import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme/ThemeContext";

const ExploreScreen = () => {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Explore</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
          Discover new chats, ideas, and updates here.
        </Text>
      </View>
    </View>
  );
};

export default ExploreScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16
  },
  title: {
    fontSize: 20,
    fontWeight: "700"
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14
  }
});
