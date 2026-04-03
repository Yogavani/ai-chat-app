import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAppTheme } from "../theme/ThemeContext";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Brain,
  Crown,
  FileText,
  Image as ImageIcon,
  MessageCircleQuestion,
  Mic,
  Sparkles,
  Volume2,
  Zap
} from "lucide-react-native";
import { RootStackParamList } from "../navigation/navigation";
import API from "../services/api";

const AIChatScreen = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabBarHeight = useBottomTabBarHeight();
  const [isPremiumUser, setIsPremiumUser] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;

      const loadPremiumState = async () => {
        try {
          const storedUserId = await AsyncStorage.getItem("userId");
          if (!storedUserId) {
            if (isMounted) setIsPremiumUser(false);
            return;
          }

          const response = await API.get(`/premium-status/${storedUserId}`);
          if (!isMounted) return;
          const value =
            response?.data?.isPremium ??
            response?.data?.data?.isPremium ??
            false;
          setIsPremiumUser(Boolean(value));
        } catch {
          if (isMounted) setIsPremiumUser(false);
        }
      };

      loadPremiumState();
      return () => {
        isMounted = false;
      };
    }, [])
  );
  const actions = [
    {
      id: "image",
      label: "Generate Image",
      caption: "Create AI images from your prompt",
      action: "generateImage",
      mode: "",
      title: "AI Image",
      icon: ImageIcon
    },
    {
      id: "tts",
      label: "Text to Speech",
      caption: "Turn your text into spoken audio",
      action: "textToSpeech",
      mode: "",
      title: "AI Text to Speech",
      icon: Volume2
    },
    {
      id: "stt",
      label: "Speech to Text",
      caption: "Record audio and transcribe instantly",
      action: "speechToText",
      mode: "",
      title: "AI Speech to Text",
      icon: Mic
    },
    {
      id: "voiceAgent",
      label: "Voice Agent",
      caption: "Talk with AI using voice",
      action: "voiceAgent",
      mode: "",
      title: "AI Voice Agent",
      icon: Volume2,
      requiresPremium: true
    },
    {
      id: "docAnalyzer",
      label: "Document Analyzer",
      caption: "Understand and extract insights from docs",
      action: "documentAnalyzer",
      mode: "professional",
      title: "AI Document Analyzer",
      icon: FileText
    },
    {
      id: "imageUnderstanding",
      label: "Image Understanding",
      caption: "Ask AI to interpret images and scenes",
      action: "imageUnderstanding",
      mode: "friendly",
      title: "AI Image Understanding",
      icon: ImageIcon
    },
    {
      id: "rewrite",
      label: "Rewrite",
      caption: "Improve your text tone instantly",
      action: "rewrite",
      mode: "professional",
      title: "AI Rewrite",
      icon: Sparkles
    },
    {
      id: "replies",
      label: "Generate Replies",
      caption: "Get quick smart response options",
      action: "generateReplies",
      mode: "friendly",
      title: "AI Replies",
      icon: Zap
    },
    {
      id: "summary",
      label: "Summarize Chat",
      caption: "Turn long chats into short notes",
      action: "summarizeChat",
      mode: "professional",
      title: "AI Summary",
      icon: FileText
    },
    {
      id: "modes",
      label: "Modes",
      caption: "Choose a style before chatting",
      action: "modes",
      mode: "",
      title: "AI Modes",
      icon: Brain
    }
  ];

  const openBotChat = (
    action:
      | "ask"
      | "generateImage"
      | "textToSpeech"
      | "speechToText"
      | "voiceAgent"
      | "documentAnalyzer"
      | "imageUnderstanding"
      | "rewrite"
      | "generateReplies"
      | "summarizeChat"
      | "modes",
    mode: string | undefined,
    title: string
  ) => {
    navigation.push("Chat", {
      receiverId: 9999999,
      receiverName: title,
      aiHubAction: action,
      aiHubMode: mode
    });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarHeight + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.primaryBox, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => openBotChat("ask", "funny", "Ask AI")}
      >
        <View style={styles.primaryHeader}>
          <MessageCircleQuestion color={colors.primary} size={20} strokeWidth={2.2} />
          <Text style={[styles.primaryText, { color: colors.text }]}>Ask AI</Text>
        </View>
        <Text style={[styles.primaryCaption, { color: colors.secondaryText }]}>
          Ask anything and get instant AI help
        </Text>
      </TouchableOpacity>

      <View style={styles.grid}>
        {actions.map((item) => (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.85}
            style={[styles.actionBox, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              if (item.requiresPremium && !isPremiumUser) {
                navigation.navigate("Premium");
                return;
              }

              openBotChat(
                item.action as
                  | "ask"
                  | "generateImage"
                  | "textToSpeech"
                  | "speechToText"
                  | "voiceAgent"
                  | "documentAnalyzer"
                  | "imageUnderstanding"
                  | "rewrite"
                  | "generateReplies"
                  | "summarizeChat"
                  | "modes",
                item.mode,
                item.title
              );
            }}
          >
            {item.requiresPremium && !isPremiumUser ? (
              <TouchableOpacity
                style={[styles.crownBadge, { backgroundColor: colors.primary }]}
                onPress={() => navigation.navigate("Premium")}
                activeOpacity={0.85}
              >
                <Crown size={13} color="#fff" strokeWidth={2.2} />
              </TouchableOpacity>
            ) : null}
            <View style={styles.actionHeader}>
              <item.icon color={colors.primary} size={16} strokeWidth={2.2} />
              <Text style={[styles.actionText, { color: colors.text }]} numberOfLines={2}>
                {item.label}
              </Text>
            </View>
            <Text style={[styles.actionCaption, { color: colors.secondaryText }]}>
              {item.caption}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
};

export default AIChatScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16
  },
  contentContainer: {
    paddingBottom: 16
  },
  primaryBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 16
  },
  primaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  primaryText: {
    fontSize: 20,
    fontWeight: "700"
  },
  primaryCaption: {
    marginTop: 6,
    fontSize: 13
  },
  grid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12
  },
  actionBox: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 92,
    paddingHorizontal: 12,
    paddingVertical: 14,
    justifyContent: "center",
    position: "relative"
  },
  crownBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  actionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8
  },
  actionText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "700"
  },
  actionCaption: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16
  }
});
