import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  Alert,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  Share,
  PermissionsAndroid,
  Linking
} from "react-native";
import { FileText, Paperclip, X } from "lucide-react-native";
import Video from "react-native-video";
import AudioRecorderPlayer from "react-native-nitro-sound";
import { launchImageLibrary } from "react-native-image-picker";
import {
  pick as pickDocument,
  types as DocumentPickerTypes,
  errorCodes as documentPickerErrorCodes,
  isErrorWithCode as isDocumentPickerErrorWithCode
} from "@react-native-documents/picker";
import { RootStackParamList } from "../navigation/navigation";
import { RouteProp } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  socket,
  ensureSocketConnection
} from "../services/socket";
import API from "../services/api";
import { useRef } from "react";
import { useAppTheme } from "../theme/ThemeContext";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { toAbsoluteImageUrl } from "../utils/image";
import { AI_FEATURE_DEFAULTS, AI_FEATURE_KEYS } from "../constants/aiFeatures";
import { trackEvent } from "../services/analytics";

type ChatScreenRouteProp = RouteProp<RootStackParamList, "Chat">;
type ChatScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "Chat"
>;

type Props = {
  route: ChatScreenRouteProp;
  navigation: ChatScreenNavigationProp;
};

type Message = {
  id: number;
  sender_id: number;
  receiver_id: number;
  message: string;
  image_url?: string;
  audio_url?: string;
  audio_model?: string;
  created_at?: string;
  client_created_at?: number;
  is_seen?: boolean;
  seen_at?: string;
};

type AnalyzerFile = {
  uri: string;
  type?: string;
  fileName?: string;
};

type ChatAttachment = {
  uri: string;
  type?: string;
  fileName?: string;
  remoteUrl?: string;
};

type AIHubAction =
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
  | "modes";
const AI_MODE_OPTIONS = ["professional", "friendly", "funny"] as const;
const DEFAULT_TTS_VOICE = "aura-2-thalia-en";
const DEFAULT_STT_MODEL = "nova-2";
const DEFAULT_VOICE_AGENT_MODE = "smart";
const CHAT_ATTACHMENT_PREFIX = "[attachment]::";

const isMessageSeen = (item: Message) => {
  return Boolean(
    item?.is_seen ||
      item?.seen_at ||
      (typeof (item as any)?.status === "string" &&
        (item as any).status.toLowerCase() === "seen")
  );
};

const mergeMessages = (items: Message[]) => {
  const byId = new Map<number, Message>();

  for (const item of items) {
    if (typeof item?.id !== "number") continue;
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }

    byId.set(item.id, {
      ...existing,
      ...item,
      is_seen: isMessageSeen(existing) || isMessageSeen(item),
      seen_at: item.seen_at ?? existing.seen_at
    });
  }

  return Array.from(byId.values());
};

const getMessageDate = (message: Message) => {
  const rawValue = message.created_at ?? message.client_created_at;
  if (!rawValue) return new Date();

  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
};

const getDayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDateLabel = (date: Date) => {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (targetStart.getTime() === todayStart.getTime()) return "Today";
  if (targetStart.getTime() === yesterdayStart.getTime()) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
};

const toNumberOrNull = (value: unknown) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const buildAIConversationContext = (chatMessages: Message[], currentUserId: number) => {
  return chatMessages
    .filter((item) => item.sender_id === currentUserId || item.sender_id === 9999999)
    .slice(-20)
    .map((item) => ({
      role: item.sender_id === currentUserId ? "user" : "assistant",
      content: item.message
    }));
};

const buildAIHubRequest = (
  action: AIHubAction,
  userText: string,
  mode?: string
): { endpoint: string; body: Record<string, any> } => {
  switch (action) {
    case "voiceAgent":
      return {
        endpoint: "/ai/voice-agent",
        body: {}
      };
    case "documentAnalyzer":
      return {
        endpoint: "/ai/ask",
        body: {
          prompt: `You are a document analyzer. Analyze this content clearly:\n\n${userText}`,
          mode: mode || "professional"
        }
      };
    case "imageUnderstanding":
      return {
        endpoint: "/ai/ask",
        body: {
          prompt: `You are an image understanding assistant. Help with this image/context request:\n\n${userText}`,
          mode: mode || "friendly"
        }
      };
    case "speechToText":
      return {
        endpoint: `/ai/speech-to-text?model=${DEFAULT_STT_MODEL}`,
        body: {}
      };
    case "textToSpeech":
      return {
        endpoint: "/ai/text-to-speech",
        body: {
          text: userText,
          voice: DEFAULT_TTS_VOICE
        }
      };
    case "generateImage":
      return {
        endpoint: "/ai/generate-image",
        body: {
          prompt: userText,
          negative_prompt: "blurry, low quality",
          width: 1024,
          height: 1024,
          steps: 4
        }
      };
    case "rewrite":
      return {
        endpoint: "/ai/rewrite",
        body: { message: userText, mode: mode || "professional" }
      };
    case "generateReplies":
      return {
        endpoint: "/ai/generate-replies",
        body: { message: userText, mode: mode || "friendly" }
      };
    case "summarizeChat":
      return {
        endpoint: "/ai/summarize-chat",
        body: { chatText: userText, mode: mode || "professional" }
      };
    case "modes":
      return {
        endpoint: "/ai/ask",
        body: { prompt: userText, mode: mode || "friendly" }
      };
    case "ask":
    default:
      return {
        endpoint: "/ai/ask",
        body: { prompt: userText, mode: mode || "funny" }
      };
  }
};

const extractAIHubReply = (
  payload: any,
  action: AIHubAction
): { text: string; imageUrl: string; audioUrl: string; audioModel: string } => {
  const root = payload?.data ?? payload ?? {};

  if (action === "generateImage") {
    const imageUrl =
      root?.imageUrl ?? root?.image_url ?? root?.data?.imageUrl ?? root?.data?.image_url ?? "";
    const resultImageUrl =
      root?.result?.imageUrl ??
      root?.result?.image_url ??
      root?.data?.result?.imageUrl ??
      root?.data?.result?.image_url ??
      root?.output?.[0] ??
      "";
    const finalImageUrl = imageUrl || resultImageUrl;
    const messageText =
      root?.message ??
      root?.data?.message ??
      (finalImageUrl ? "Image generated successfully." : "Unable to generate image.");

    return {
      text: typeof messageText === "string" ? messageText : "Image generated.",
      imageUrl: typeof finalImageUrl === "string" ? finalImageUrl : "",
      audioUrl: "",
      audioModel: ""
    };
  }

  if (action === "textToSpeech") {
    const audioUrl =
      root?.audioUrl ??
      root?.audio_url ??
      root?.url ??
      root?.fileUrl ??
      root?.data?.audioUrl ??
      root?.data?.audio_url ??
      root?.data?.url ??
      "";
    const messageText =
      root?.message ??
      root?.data?.message ??
      (audioUrl ? "Audio generated successfully." : "Unable to generate audio.");
    const audioModel = root?.model ?? root?.data?.model ?? "";

    return {
      text: typeof messageText === "string" ? messageText : "Audio generated.",
      imageUrl: "",
      audioUrl: typeof audioUrl === "string" ? audioUrl : "",
      audioModel: typeof audioModel === "string" ? audioModel : ""
    };
  }

  if (action === "speechToText") {
    const transcript =
      root?.transcript ??
      root?.data?.transcript ??
      root?.result?.transcript ??
      "";
    const text =
      typeof transcript === "string" && transcript.trim().length > 0
        ? transcript.trim()
        : root?.message ?? root?.data?.message ?? "";

    return {
      text: typeof text === "string" ? text : "",
      imageUrl: "",
      audioUrl: "",
      audioModel: ""
    };
  }

  if (action === "generateReplies") {
    const replies =
      root?.suggestions ??
      root?.replies ??
      root?.suggestedReplies ??
      root?.data?.suggestions ??
      [];
    if (Array.isArray(replies) && replies.length) {
      const text = replies
        .map((item: any, index: number) => {
          if (typeof item === "string") return `${index + 1}. ${item}`;
          if (typeof item?.message === "string") return `${index + 1}. ${item.message}`;
          if (typeof item?.text === "string") return `${index + 1}. ${item.text}`;
          return "";
        })
        .filter(Boolean)
        .join("\n");
      return { text, imageUrl: "", audioUrl: "", audioModel: "" };
    }
  }

  const text =
    root?.answer ??
    root?.response ??
    root?.summary ??
    root?.rewrittenMessage ??
    root?.rewritten_message ??
    root?.message ??
    root?.data?.answer ??
    root?.data?.response ??
    root?.data?.summary ??
    root?.data?.rewrittenMessage ??
    root?.data?.message ??
    "";

  // Fallback: if API returned a URL as plain text in message/response, use it as image URL too.
  const imageUrlFromTextMatch =
    typeof text === "string"
      ? text.match(/https?:\/\/\S+\.(?:png|jpg|jpeg|webp)(\?\S*)?/i)?.[0] || ""
      : "";

  return {
    text: typeof text === "string" ? text : "",
    imageUrl: imageUrlFromTextMatch,
    audioUrl: "",
    audioModel: ""
  };
};

const getAIStarterMessageByAction = (action: AIHubAction) => {
  switch (action) {
    case "documentAnalyzer":
      return "Paste document text and I will analyze it, summarize key points, and extract insights.";
    case "imageUnderstanding":
      return "Describe or share image context, and I will help interpret objects, scene, and meaning.";
    case "voiceAgent":
      return "Tap the mic, speak, and I will reply with voice.";
    case "speechToText":
      return "Tap Record to capture your voice and I will transcribe it.";
    case "textToSpeech":
      return "Send any text and I will convert it into speech.";
    case "generateImage":
      return "Describe the image you want and I will generate it for you.";
    case "rewrite":
      return "Share any sentence and I will rewrite it in a better tone.";
    case "generateReplies":
      return "Paste a message and I will generate smart reply options for you.";
    case "summarizeChat":
      return "Paste your chat text and I will summarize it clearly.";
    case "modes":
      return "Choose a mode and ask anything. I will respond in that style.";
    case "ask":
    default:
      return "Ask me anything.";
  }
};

const normalizeAnalyzerMimeType = (mimeType?: string, fileName?: string) => {
  const normalizedMime = (mimeType || "").trim().toLowerCase();
  const normalizedFileName = (fileName || "").trim().toLowerCase();

  if (
    normalizedMime === "text/comma-separated-values" ||
    normalizedMime === "application/csv" ||
    normalizedMime === "application/x-csv"
  ) {
    return "text/csv";
  }

  if (!normalizedMime && normalizedFileName.endsWith(".csv")) {
    return "text/csv";
  }

  return normalizedMime || undefined;
};

const toFriendlyAIErrorMessage = (rawMessage?: string) => {
  const value = String(rawMessage || "");
  const lower = value.toLowerCase();

  if (
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("resource_exhausted") ||
    lower.includes("billing")
  ) {
    return "AI usage limit reached right now. Please try again in a bit, or switch the backend model/billing settings.";
  }

  return value || "Unable to send message right now.";
};

const formatMessageForDisplay = (value?: string) => {
  const text = String(value || "");
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,!?:;]|$)/g, "$1$2");
};

const isLikelyImageUrl = (value?: string) => {
  const url = String(value || "").toLowerCase();
  return /\.(png|jpg|jpeg|webp|gif)(\?.*)?$/.test(url);
};

const isLikelyVideoUrl = (value?: string) => {
  const url = String(value || "").toLowerCase();
  return /\.(mp4|mov|m4v|webm)(\?.*)?$/.test(url);
};

const parseChatAttachmentFromMessage = (value?: string) => {
  const message = String(value || "");
  if (!message.startsWith(CHAT_ATTACHMENT_PREFIX)) return null;

  const raw = message.slice(CHAT_ATTACHMENT_PREFIX.length);
  const [urlLine, ...captionLines] = raw.split("\n");
  const rawUrl = (urlLine || "").trim();
  const url = toAbsoluteImageUrl(rawUrl) || rawUrl;
  if (!url) return null;

  const caption = captionLines.join("\n").trim();
  return { url, caption };
};

const ChatScreen = ({ route, navigation }: Props) => {
  const { colors, resolvedTheme } = useAppTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [senderId, setSenderId] = useState<number | null>(null);
  const [seenMessageIds, setSeenMessageIds] = useState<Set<number>>(new Set());
  const [isReceiverTyping, setIsReceiverTyping] = useState(false);
  const [isAITyping, setIsAITyping] = useState(false);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [isSuggestingReplies, setIsSuggestingReplies] = useState(false);
  const [aiAutoReplyEnabled, setAIAutoReplyEnabled] = useState<boolean>(
    AI_FEATURE_DEFAULTS.autoReply
  );
  const [aiSuggestionsEnabled, setAISuggestionsEnabled] = useState<boolean>(
    AI_FEATURE_DEFAULTS.suggestions
  );
  const [aiRewriteEnabled, setAIRewriteEnabled] = useState<boolean>(
    AI_FEATURE_DEFAULTS.rewrite
  );
  const [isReceiverOnline, setIsReceiverOnline] = useState(false);
  const [typingDots, setTypingDots] = useState(".");
  const [playingAudioMessageId, setPlayingAudioMessageId] = useState<number | null>(null);
  const [playingAudioUrl, setPlayingAudioUrl] = useState("");
  const [isAudioPaused, setIsAudioPaused] = useState(true);
  const [audioPlayerSessionKey, setAudioPlayerSessionKey] = useState(0);
  const [isSpeechToTextProcessing, setIsSpeechToTextProcessing] = useState(false);
  const {
    receiverId,
    receiverName,
    receiverProfileImage,
    aiHubAction = "ask",
    aiHubMode
  } = route.params;
  const isAIChat = receiverId === 9999999;
  const isVoiceCaptureMode =
    isAIChat && (aiHubAction === "speechToText" || aiHubAction === "voiceAgent");
  const isAnalyzerMode =
    isAIChat && (aiHubAction === "documentAnalyzer" || aiHubAction === "imageUnderstanding");
  const [selectedAIHubMode, setSelectedAIHubMode] = useState<string>(
    aiHubAction === "modes" ? "" : aiHubMode || ""
  );
  const [selectedAnalyzerFile, setSelectedAnalyzerFile] = useState<AnalyzerFile | null>(null);
  const [isAnalyzerUploading, setIsAnalyzerUploading] = useState(false);
  const [selectedChatAttachment, setSelectedChatAttachment] = useState<ChatAttachment | null>(null);
  const [isChatAttachmentUploading, setIsChatAttachmentUploading] = useState(false);
  const [hasNavAvatarLoadFailed, setHasNavAvatarLoadFailed] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const shouldAutoScrollRef = useRef(true);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiReplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSuggestedMessageIdRef = useRef<number | null>(null);
  const audioRecorderRef = useRef(AudioRecorderPlayer);
  const recordedAudioPathRef = useRef("");
  const [isSpeechRecording, setIsSpeechRecording] = useState(false);
  const localMessageIdRef = useRef(-1);

  const nextLocalMessageId = () => {
    localMessageIdRef.current -= 1;
    return localMessageIdRef.current;
  };

  useEffect(() => {
    loadSenderId();
  }, []);

  useEffect(() => {
    return () => {
      if (isSpeechRecording) {
        audioRecorderRef.current.stopRecorder().catch(() => null);
      }
    };
  }, [isSpeechRecording]);

  useEffect(() => {
    setSelectedAIHubMode(aiHubAction === "modes" ? "" : aiHubMode || "");
  }, [aiHubAction, aiHubMode]);

  useEffect(() => {
    setSelectedAnalyzerFile(null);
    setSelectedChatAttachment(null);
    setText("");
  }, [aiHubAction, receiverId]);

  useEffect(() => {
    setHasNavAvatarLoadFailed(false);
  }, [receiverId, receiverProfileImage]);

  useEffect(() => {
    void trackEvent("chat_opened", {
      receiver_id: receiverId,
      is_ai_chat: isAIChat,
      ai_action: isAIChat ? aiHubAction : undefined
    });
  }, [receiverId, isAIChat, aiHubAction]);

  useEffect(() => {
    if (!isAIChat) return;
    setMessages((prev) => {
      if (prev.length > 0) return prev;
      const starter: Message = {
        id: -900000 - Date.now(),
        sender_id: receiverId,
        receiver_id: senderId ?? 0,
        message: getAIStarterMessageByAction(aiHubAction as AIHubAction),
        client_created_at: Date.now()
      };
      return [starter];
    });
  }, [isAIChat, aiHubAction, receiverId, senderId]);

  useEffect(() => {
    const loadAIFeatures = async () => {
      const [autoReplyByUserValue, suggestionsByUserValue, rewriteByUserValue] = await Promise.all([
        AsyncStorage.getItem(AI_FEATURE_KEYS.autoReplyByUser),
        AsyncStorage.getItem(AI_FEATURE_KEYS.suggestionsByUser),
        AsyncStorage.getItem(AI_FEATURE_KEYS.rewriteByUser)
      ]);

      if (autoReplyByUserValue) {
        try {
          const parsed = JSON.parse(autoReplyByUserValue) as Record<string, boolean>;
          const contactValue = parsed[String(receiverId)];
          if (typeof contactValue === "boolean") {
            setAIAutoReplyEnabled(contactValue);
          } else {
            setAIAutoReplyEnabled(AI_FEATURE_DEFAULTS.autoReply);
          }
        } catch (error) {
          setAIAutoReplyEnabled(AI_FEATURE_DEFAULTS.autoReply);
        }
      } else {
        setAIAutoReplyEnabled(AI_FEATURE_DEFAULTS.autoReply);
      }
      if (suggestionsByUserValue) {
        try {
          const parsed = JSON.parse(suggestionsByUserValue) as Record<string, boolean>;
          const contactValue = parsed[String(receiverId)];
          if (typeof contactValue === "boolean") {
            setAISuggestionsEnabled(contactValue);
          } else {
            setAISuggestionsEnabled(AI_FEATURE_DEFAULTS.suggestions);
          }
        } catch (error) {
          setAISuggestionsEnabled(AI_FEATURE_DEFAULTS.suggestions);
        }
      } else {
        setAISuggestionsEnabled(AI_FEATURE_DEFAULTS.suggestions);
      }

      if (rewriteByUserValue) {
        try {
          const parsed = JSON.parse(rewriteByUserValue) as Record<string, boolean>;
          const contactValue = parsed[String(receiverId)];
          if (typeof contactValue === "boolean") {
            setAIRewriteEnabled(contactValue);
          } else {
            setAIRewriteEnabled(AI_FEATURE_DEFAULTS.rewrite);
          }
        } catch (error) {
          setAIRewriteEnabled(AI_FEATURE_DEFAULTS.rewrite);
        }
      } else {
        setAIRewriteEnabled(AI_FEATURE_DEFAULTS.rewrite);
      }
    };

    loadAIFeatures();
  }, [receiverId]);

  useLayoutEffect(() => {
    const isVoiceFlow = isAIChat && (aiHubAction === "speechToText" || aiHubAction === "voiceAgent");
    const isAISpeaking = isVoiceFlow && (isAITyping || (!isAudioPaused && playingAudioMessageId !== null));

    const statusText = isAIChat
      ? isAISpeaking
        ? "speaking..."
        : "AI assistant"
      : isReceiverTyping
      ? "typing..."
      : isReceiverOnline
      ? "online"
      : "offline";

    const rawProfileImage = String(receiverProfileImage || "").trim();
    const hasExplicitlyInvalidImageValue =
      rawProfileImage.length === 0 ||
      rawProfileImage.toLowerCase() === "null" ||
      rawProfileImage.toLowerCase() === "undefined";
    const profileImage = hasExplicitlyInvalidImageValue ? "" : toAbsoluteImageUrl(rawProfileImage);
    const shouldShowNavAvatarImage = Boolean(profileImage) && !hasNavAvatarLoadFailed;

    navigation.setOptions({
      headerTitleAlign: "left",
      headerTitle: () => (
        <View style={styles.navHeaderContent}>
          {shouldShowNavAvatarImage ? (
            <Image
              source={{ uri: profileImage }}
              style={styles.navAvatar}
              onError={() => setHasNavAvatarLoadFailed(true)}
            />
          ) : (
            <View
              style={[
                styles.navAvatarFallback,
                { backgroundColor: colors.chipBackground }
              ]}
            >
              <Text style={[styles.navAvatarInitial, { color: colors.primary }]}>
                {receiverName?.trim()?.charAt(0)?.toUpperCase() || "?"}
              </Text>
            </View>
          )}
          <View style={styles.navTextWrap}>
            <Text style={[styles.navNameText, { color: colors.text }]} numberOfLines={1}>
              {receiverName}
            </Text>
            <Text
              style={[
                styles.navStatusText,
                {
                  color:
                    (isAIChat && isAITyping) || (!isAIChat && isReceiverTyping)
                      ? colors.primary
                      : colors.secondaryText
                }
              ]}
              numberOfLines={1}
            >
              {statusText}
            </Text>
          </View>
        </View>
      )
    });
  }, [
    navigation,
    receiverName,
    receiverProfileImage,
    isAIChat,
    aiHubAction,
    isAITyping,
    isAudioPaused,
    playingAudioMessageId,
    isReceiverTyping,
    isReceiverOnline,
    hasNavAvatarLoadFailed,
    colors.text,
    colors.secondaryText,
    colors.primary,
    colors.chipBackground
  ]);

  useEffect(() => {
    if (senderId !== null) {
      fetchMessages();
    }
  }, [senderId, receiverId]);

  useEffect(() => {
    if (isAIChat) return;
    if (!senderId) return;

    const incomingUnreadIds = messages
      .filter(
        (item) =>
          item.sender_id === receiverId &&
          item.receiver_id === senderId &&
          !seenMessageIds.has(item.id)
      )
      .map((item) => item.id);

    if (incomingUnreadIds.length === 0) return;

    socket.emit("messages-seen", {
      messageIds: incomingUnreadIds,
      fromUserId: senderId,
      toUserId: receiverId
    });

    setSeenMessageIds((prev) => {
      const next = new Set(prev);
      incomingUnreadIds.forEach((id) => next.add(id));
      return next;
    });
  }, [messages, senderId, receiverId, seenMessageIds, isAIChat]);

  useEffect(() => {
    if (messages.length === 0) return;

    const timer = setTimeout(() => {
      if (shouldAutoScrollRef.current) {
        flatListRef.current?.scrollToEnd({ animated: true });
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [messages.length]);

  useEffect(() => {
    if (isAIChat) return;
    if (!senderId) return;

    const onConnect = () => {
      console.log("SOCKET CONNECTED:", socket.id);
      socket.emit("join", senderId);
      console.log("JOINING ROOM:", senderId);
    };

    const onConnectError = (err: any) => {
      console.log("SOCKET CONNECT ERROR:", err?.message || err);
    };

    const onNewMessage = (msg: Message | any) => {
      console.log("SOCKET MESSAGE RECEIVED:", msg);

      if (
        !msg ||
        typeof msg !== "object" ||
        typeof msg.sender_id !== "number" ||
        typeof msg.receiver_id !== "number"
      ) {
        fetchMessages();
        return;
      }

      const isCurrentChatMessage =
        (msg.sender_id === senderId && msg.receiver_id === receiverId) ||
        (msg.sender_id === receiverId && msg.receiver_id === senderId);

      if (!isCurrentChatMessage) return;

      setMessages((prev) => {
        return mergeMessages([
          ...prev,
          { ...msg, client_created_at: Date.now() }
        ]);
      });

      if (msg.sender_id === receiverId && msg.receiver_id === senderId) {
        socket.emit("messages-seen", {
          messageIds: [msg.id],
          fromUserId: senderId,
          toUserId: receiverId
        });
        setSeenMessageIds((prev) => {
          const next = new Set(prev);
          next.add(msg.id);
          return next;
        });
      }
    };

    const onTyping = (payload: any) => {
      console.log("SOCKET TYPING EVENT:", payload);
      const fromUserId = toNumberOrNull(
        payload?.fromUserId ?? payload?.sender_id ?? payload?.userId
      );
      const toUserId = toNumberOrNull(payload?.toUserId ?? payload?.receiver_id);

      if (
        fromUserId === receiverId &&
        (toUserId === null || toUserId === senderId)
      ) {
        setIsReceiverTyping(true);
      }
    };

    const onStopTyping = (payload: any) => {
      console.log("SOCKET STOP TYPING EVENT:", payload);
      const fromUserId = toNumberOrNull(
        payload?.fromUserId ?? payload?.sender_id ?? payload?.userId
      );
      const toUserId = toNumberOrNull(payload?.toUserId ?? payload?.receiver_id);

      if (
        fromUserId === receiverId &&
        (toUserId === null || toUserId === senderId)
      ) {
        setIsReceiverTyping(false);
      }
    };

    const onUserStatus = (payload: any) => {
      if (payload?.userId === receiverId) {
        setIsReceiverOnline(Boolean(payload?.online));
      }
    };

    const onMessageSeen = (payload: any) => {
      const ids: number[] = [];

      if (Array.isArray(payload?.messageIds)) {
        payload.messageIds.forEach((id: unknown) => {
          const parsed = Number(id);
          if (!Number.isNaN(parsed)) ids.push(parsed);
        });
      }

      const singleId = Number(payload?.messageId);
      if (!Number.isNaN(singleId)) {
        ids.push(singleId);
      }

      if (ids.length === 0) return;

      setSeenMessageIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });

      setMessages((prev) =>
        prev.map((item) =>
          ids.includes(item.id) ? { ...item, is_seen: true } : item
        )
      );
    };

    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    socket.on("new-message", onNewMessage);
    socket.on("typing", onTyping);
    socket.on("stop-typing", onStopTyping);
    socket.on("user-status", onUserStatus);
    socket.on("message-seen", onMessageSeen);
    socket.on("messages-seen", onMessageSeen);

    if (socket.connected) {
      onConnect();
    } else {
      ensureSocketConnection();
    }

    socket.emit("get-user-status", { userId: receiverId });
  
    return () => {
      socket.emit("stop-typing", {
        fromUserId: senderId,
        toUserId: receiverId
      });
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.off("new-message", onNewMessage);
      socket.off("typing", onTyping);
      socket.off("stop-typing", onStopTyping);
      socket.off("user-status", onUserStatus);
      socket.off("message-seen", onMessageSeen);
      socket.off("messages-seen", onMessageSeen);
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      if (aiReplyTimerRef.current) {
        clearTimeout(aiReplyTimerRef.current);
        aiReplyTimerRef.current = null;
      }
    };
  }, [senderId, receiverId, isAIChat]);

  useEffect(() => {
    if (isAIChat) return;
    if (!senderId) return;

    const interval = setInterval(() => {
      fetchMessages();
    }, 3500);

    return () => clearInterval(interval);
  }, [senderId, receiverId, isAIChat]);

  useEffect(() => {
    console.log("TYPING STATE:", isReceiverTyping);
  }, [isReceiverTyping]);

  const showTypingIndicator = isAIChat ? isAITyping : isReceiverTyping;

  useEffect(() => {
    if (!showTypingIndicator) {
      setTypingDots(".");
      return;
    }

    const interval = setInterval(() => {
      setTypingDots((prev) => {
        if (prev === "...") return ".";
        return `${prev}.`;
      });
    }, 350);

    return () => clearInterval(interval);
  }, [showTypingIndicator]);

  const loadSenderId = async () => {
    try {
      const savedUserId = await AsyncStorage.getItem("userId");
      if (!savedUserId) {
        console.log("No userId found in AsyncStorage");
        return;
      }

      const parsedUserId = Number(savedUserId);
      if (Number.isNaN(parsedUserId)) {
        console.log("Stored userId is invalid");
        return;
      }

      setSenderId(parsedUserId);
    } catch (error) {
      console.log("Load sender id error:", error);
    }
  };
  
  const fetchMessages = async () => {
    if (senderId === null) return;
  
    try {
      const response = await API.get(
        `/receive-message/${senderId}/${receiverId}`
      );
      console.log("MESSAGES fetchMessages:", response.data);
      const normalizedMessages: Message[] = (response.data || []).map(
        (item: Message) => ({
          ...item,
          client_created_at: item.client_created_at ?? Date.now()
        })
      );
      if (isAIChat && normalizedMessages.length === 0) {
        const starter: Message = {
          id: -800000 - Date.now(),
          sender_id: receiverId,
          receiver_id: senderId,
          message: getAIStarterMessageByAction(aiHubAction as AIHubAction),
          client_created_at: Date.now()
        };
        setMessages([starter]);
      } else {
        setMessages(mergeMessages(normalizedMessages));
      }
      setSeenMessageIds(() => {
        const next = new Set<number>();
        normalizedMessages.forEach((item) => {
          if (isMessageSeen(item)) next.add(item.id);
        });
        return next;
      });
    } catch (error) {
      console.log("Fetch messages error:", error);
    }
  };
  const sendMessage = async () => {
    if (senderId === null) return;
    if (isVoiceCaptureMode) {
      Alert.alert("Use Record", "Tap Record to capture audio.");
      return;
    }
    if (isAnalyzerMode && !selectedAnalyzerFile?.uri) {
      Alert.alert(
        "Select File",
        aiHubAction === "imageUnderstanding"
          ? "Please select an image first."
          : "Please select a document/file first."
      );
      return;
    }
    if (!isAnalyzerMode && !text.trim() && !selectedChatAttachment?.remoteUrl) return;
    if (isAIChat && aiHubAction === "modes" && !selectedAIHubMode) {
      Alert.alert("Select mode", "Please select a mode before sending.");
      return;
    }
  
    try {
      const pendingText = text;
      if (isAIChat) {
        void trackEvent("ai_action_used", {
          action: aiHubAction,
          mode: selectedAIHubMode || aiHubMode || undefined
        });
        if (isAnalyzerMode) {
          setIsAnalyzerUploading(true);
          setIsAITyping(true);
          const localUserMessage: Message = {
            id: nextLocalMessageId(),
            sender_id: senderId,
            receiver_id: receiverId,
            message: pendingText.trim() || `Uploaded ${selectedAnalyzerFile?.fileName || "file"}`,
            client_created_at: Date.now()
          };
          setMessages((prev) => mergeMessages([...prev, localUserMessage]));
          setText("");
          setSuggestedReplies([]);

          const cleanUri =
            selectedAnalyzerFile?.uri?.startsWith("file://") ||
            selectedAnalyzerFile?.uri?.startsWith("content://")
              ? (selectedAnalyzerFile?.uri as string)
              : `file://${selectedAnalyzerFile?.uri}`;

          const formData = new FormData();
          formData.append(
            "file",
            {
              uri: cleanUri,
              type:
                normalizeAnalyzerMimeType(
                  selectedAnalyzerFile?.type,
                  selectedAnalyzerFile?.fileName
                ) ||
                (aiHubAction === "imageUnderstanding" ? "image/jpeg" : "application/octet-stream"),
              name:
                selectedAnalyzerFile?.fileName ||
                `${aiHubAction === "imageUnderstanding" ? "image" : "document"}-${Date.now()}`
            } as any
          );

          const optionalPrompt = pendingText.trim();
          if (optionalPrompt) {
            formData.append("prompt", optionalPrompt);
          }

          const baseUrl = (API.defaults.baseURL || "").replace(/\/$/, "");
          const endpoint =
            aiHubAction === "imageUnderstanding"
              ? `${baseUrl}/ai/image-understanding`
              : `${baseUrl}/ai/document-analyzer`;

          const response = await fetch(endpoint, {
            method: "POST",
            body: formData
          });
          const responseText = await response.text();
          let responseJson: any = {};
          try {
            responseJson = responseText ? JSON.parse(responseText) : {};
          } catch {
            responseJson = { message: responseText || "Invalid server response" };
          }

          if (!response.ok) {
            throw new Error(
              responseJson?.message ||
                responseJson?.error ||
                `${aiHubAction} failed with status ${response.status}`
            );
          }

          const output =
            responseJson?.output ??
            responseJson?.data?.output ??
            responseJson?.message ??
            "";

          if (!output || typeof output !== "string") {
            throw new Error("No analyzer output returned.");
          }

          const localAIMessage: Message = {
            id: nextLocalMessageId(),
            sender_id: receiverId,
            receiver_id: senderId,
            message: output.trim(),
            client_created_at: Date.now()
          };

          setMessages((prev) => mergeMessages([...prev, localAIMessage]));
          setSelectedAnalyzerFile(null);
          setIsAITyping(false);
          setIsAnalyzerUploading(false);
          return;
        }

        setIsAITyping(true);
        const localUserMessage: Message = {
          id: nextLocalMessageId(),
          sender_id: senderId,
          receiver_id: receiverId,
          message: pendingText,
          client_created_at: Date.now()
        };
        setMessages((prev) => mergeMessages([...prev, localUserMessage]));
        setText("");
        setSuggestedReplies([]);

        const effectiveMode =
          aiHubAction === "modes"
            ? selectedAIHubMode
            : selectedAIHubMode || aiHubMode || undefined;
        const { endpoint, body } = buildAIHubRequest(
          aiHubAction as AIHubAction,
          pendingText,
          effectiveMode
        );
        console.log("[AIHub] request", { action: aiHubAction, endpoint, body });
        const aiResponse = await API.post(endpoint, body);
        console.log("[AIHub] response", aiResponse?.data);
        const aiReply = extractAIHubReply(aiResponse?.data, aiHubAction as AIHubAction);
        const aiReplyText = aiReply.text?.trim();
        const aiReplyImageUrl = aiReply.imageUrl?.trim();
        const aiReplyAudioUrl = aiReply.audioUrl?.trim();
        const aiReplyAudioModel = aiReply.audioModel?.trim();

        if (!aiReplyText && !aiReplyImageUrl && !aiReplyAudioUrl) {
          throw new Error("No AI response text returned.");
        }

        const aiReplyDelayMs = 1000;
        await new Promise<void>((resolve) => {
          if (aiReplyTimerRef.current) {
            clearTimeout(aiReplyTimerRef.current);
          }
          aiReplyTimerRef.current = setTimeout(() => {
            const localAIMessage: Message = {
              id: nextLocalMessageId(),
              sender_id: receiverId,
              receiver_id: senderId,
              message: aiReplyText || "Response generated successfully.",
              image_url: aiReplyImageUrl || undefined,
              audio_url: aiReplyAudioUrl || undefined,
              audio_model: aiReplyAudioModel || undefined,
              client_created_at: Date.now()
            };
            setMessages((prev) => mergeMessages([...prev, localAIMessage]));
            setIsAITyping(false);
            aiReplyTimerRef.current = null;
            resolve();
          }, aiReplyDelayMs);
        });
        return;
      }

      const attachmentUrl = toAbsoluteImageUrl(selectedChatAttachment?.remoteUrl?.trim() || "");
      const outgoingMessage = attachmentUrl
        ? `${CHAT_ATTACHMENT_PREFIX}${attachmentUrl}${pendingText.trim() ? `\n${pendingText.trim()}` : ""}`
        : pendingText;

      const requestPayload = {
        sender_id: senderId,
        receiver_id: receiverId,
        message: outgoingMessage
      };
      const response = await API.post("/send-message", requestPayload);
      console.log("NEW MESSAGESSS:", response.data);
      const payload =
        response.data?.data ??
        response.data?.result ??
        response.data ??
        {};

      const newMessage = {
        ...payload,
        client_created_at: Date.now()
      } as Message;
      setMessages((prev) => mergeMessages([...prev, newMessage]));
      void trackEvent("message_sent", {
        length: pendingText.trim().length,
        has_attachment: Boolean(attachmentUrl),
        receiver_id: receiverId
      });
      setText("");
      setSelectedChatAttachment(null);
      setSuggestedReplies([]);
      socket.emit("stop-typing", {
        fromUserId: senderId,
        toUserId: receiverId
      });
    } catch (error: any) {
      console.log("Send message error:", error);
      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Unable to send message right now.";
      const friendlyMessage = toFriendlyAIErrorMessage(backendMessage);

      if (isAIChat) {
        Alert.alert("AI Reply Failed", friendlyMessage);
      } else {
        Alert.alert("Send Failed", friendlyMessage);
      }
    } finally {
      if (isAnalyzerMode) {
        setIsAnalyzerUploading(false);
      }
      if (isAIChat && !aiReplyTimerRef.current) {
        setIsAITyping(false);
      }
    }
  };

  const transcribeAudioUri = async (audioUri: string) => {
    if (!audioUri || senderId === null) return;

    try {
      setIsSpeechToTextProcessing(true);
      setIsAITyping(true);

      const localUserMessage: Message = {
        id: nextLocalMessageId(),
        sender_id: senderId,
        receiver_id: receiverId,
        message: "🎤 Voice note sent",
        client_created_at: Date.now()
      };
      setMessages((prev) => mergeMessages([...prev, localUserMessage]));

      const cleanUri =
        audioUri.startsWith("file://") || audioUri.startsWith("content://")
          ? audioUri
          : `file://${audioUri}`;
      const formData = new FormData();
      formData.append(
        "file",
        {
          uri: cleanUri,
          type: "audio/m4a",
          name: `speech-${Date.now()}.m4a`
        } as any
      );

      const baseUrl = (API.defaults.baseURL || "").replace(/\/$/, "");
      const endpoint = `${baseUrl}/ai/speech-to-text?model=${encodeURIComponent(
        DEFAULT_STT_MODEL
      )}`;
      console.log("[STT] upload start", { cleanUri, endpoint });

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData
      });
      const responseText = await response.text();
      let responseJson: any = {};
      try {
        responseJson = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseJson = { message: responseText || "Invalid server response" };
      }

      if (!response.ok) {
        throw new Error(
          responseJson?.message ||
            responseJson?.error ||
            `Speech-to-text failed with status ${response.status}`
        );
      }

      console.log("[STT] upload success", responseJson);

      const transcript =
        responseJson?.transcript ??
        responseJson?.data?.transcript ??
        responseJson?.result?.transcript ??
        "";
      if (!transcript || typeof transcript !== "string") {
        throw new Error("No transcript returned");
      }

      const aiMessage: Message = {
        id: nextLocalMessageId(),
        sender_id: receiverId,
        receiver_id: senderId,
        message: transcript.trim(),
        client_created_at: Date.now()
      };
      setMessages((prev) => mergeMessages([...prev, aiMessage]));
    } catch (error: any) {
      console.log("Speech-to-text error:", error);
      const backendMessage =
        error?.message ||
        "Unable to transcribe audio right now.";
      Alert.alert("Transcription Failed", backendMessage);
    } finally {
      setIsSpeechToTextProcessing(false);
      setIsAITyping(false);
    }
  };

  const processVoiceAgentAudioUri = async (audioUri: string) => {
    if (!audioUri || senderId === null) return;

    try {
      setIsSpeechToTextProcessing(true);
      setIsAITyping(true);

      const cleanUri =
        audioUri.startsWith("file://") || audioUri.startsWith("content://")
          ? audioUri
          : `file://${audioUri}`;
      const formData = new FormData();
      formData.append(
        "file",
        {
          uri: cleanUri,
          type: "audio/m4a",
          name: `voice-agent-${Date.now()}.m4a`
        } as any
      );

      const activeMode = selectedAIHubMode || aiHubMode || DEFAULT_VOICE_AGENT_MODE;
      const baseUrl = (API.defaults.baseURL || "").replace(/\/$/, "");
      const endpoint =
        `${baseUrl}/ai/voice-agent?mode=${encodeURIComponent(activeMode)}` +
        `&stt_model=${encodeURIComponent(DEFAULT_STT_MODEL)}` +
        `&tts_model=${encodeURIComponent(DEFAULT_TTS_VOICE)}`;
      console.log("[VoiceAgent] upload start", { cleanUri, endpoint });

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData
      });
      const responseText = await response.text();
      let responseJson: any = {};
      try {
        responseJson = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseJson = { message: responseText || "Invalid server response" };
      }

      if (!response.ok) {
        throw new Error(
          responseJson?.message ||
            responseJson?.error ||
            `Voice agent failed with status ${response.status}`
        );
      }

      console.log("[VoiceAgent] upload success", responseJson);

      const aiText = (
        responseJson?.aiText ??
        responseJson?.ai_text ??
        responseJson?.message ??
        ""
      )
        .toString()
        .trim();
      const audioUrl = (
        responseJson?.audioUrl ??
        responseJson?.audio_url ??
        responseJson?.data?.audioUrl ??
        ""
      )
        .toString()
        .trim();

      if (!aiText && !audioUrl) {
        throw new Error("No voice agent response returned.");
      }

      const aiMessage: Message = {
        id: nextLocalMessageId(),
        sender_id: receiverId,
        receiver_id: senderId,
        message: aiText || "Voice reply generated.",
        audio_url: audioUrl || undefined,
        audio_model: responseJson?.ttsModel || responseJson?.tts_model || undefined,
        client_created_at: Date.now()
      };
      setMessages((prev) => mergeMessages([...prev, aiMessage]));

      if (audioUrl) {
        const resolvedAudioUrl = toAbsoluteImageUrl(audioUrl) || audioUrl;
        setPlayingAudioMessageId(aiMessage.id);
        setPlayingAudioUrl(resolvedAudioUrl);
        setIsAudioPaused(false);
        setAudioPlayerSessionKey((prev) => prev + 1);
      }
    } catch (error: any) {
      console.log("Voice agent error:", error);
      const backendMessage =
        error?.message || "Unable to process voice agent request right now.";
      Alert.alert("Voice Agent Failed", backendMessage);
    } finally {
      setIsSpeechToTextProcessing(false);
      setIsAITyping(false);
    }
  };

  const handleRecordAndTranscribe = async () => {
    if (senderId === null) return;
    if (!isVoiceCaptureMode) return;

    try {
      if (!isSpeechRecording) {
        if (Platform.OS === "android") {
          const hasAudioPermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
          );
          if (!hasAudioPermission) {
            const permission = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
              {
                title: "Microphone permission",
                message: "Microphone access is required to record audio for speech-to-text.",
                buttonPositive: "Allow",
                buttonNegative: "Not now"
              }
            );
            if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
              Alert.alert(
                "Permission Required",
                "Please enable microphone permission in app settings.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Open Settings",
                    onPress: () => {
                      Linking.openSettings().catch(() => null);
                    }
                  }
                ]
              );
              return;
            }
          }
        }

        try {
          const path = await audioRecorderRef.current.startRecorder();
          console.log("[STT] recorder started", { path });
          recordedAudioPathRef.current = path;
          setIsSpeechRecording(true);
        } catch (recordStartError) {
          console.log("[STT] startRecorder failed", recordStartError);
          Alert.alert(
            "Record Failed",
            "Unable to start recording. Please check microphone permission and try again."
          );
        }
        return;
      }

      const stoppedPath = await audioRecorderRef.current.stopRecorder();
      setIsSpeechRecording(false);
      const finalPath = stoppedPath || recordedAudioPathRef.current;
      if (!finalPath) {
        Alert.alert("Record Failed", "No audio captured. Please try again.");
        return;
      }
      if (aiHubAction === "voiceAgent") {
        await processVoiceAgentAudioUri(finalPath);
      } else {
        await transcribeAudioUri(finalPath);
      }
    } catch (error: any) {
      console.log("Speech record/transcribe error:", error);
      setIsSpeechRecording(false);
      Alert.alert("Record Failed", "Unable to record audio right now.");
    }
  };

  const pickAnalyzerFile = async () => {
    try {
      if (aiHubAction === "imageUnderstanding") {
        const result = await launchImageLibrary({
          mediaType: "photo",
          selectionLimit: 1,
          quality: 1
        });

        if (result.didCancel) return;
        const asset = result.assets?.[0];
        if (!asset?.uri) return;

        setSelectedAnalyzerFile({
          uri: asset.uri,
          type: asset.type || undefined,
          fileName: asset.fileName || undefined
        });
        return;
      }

      const picked = await pickDocument({
        allowMultiSelection: false,
        type: [DocumentPickerTypes.allFiles]
      });
      const file = picked?.[0];
      if (!file?.uri) return;

      setSelectedAnalyzerFile({
        uri: file.uri,
        type: file.type || undefined,
        fileName: file.name || undefined
      });
    } catch (error: any) {
      if (
        isDocumentPickerErrorWithCode(error) &&
        error.code === documentPickerErrorCodes.OPERATION_CANCELED
      ) {
        return;
      }
      Alert.alert("File Picker Error", "Unable to open file picker right now.");
    }
  };

  const uploadChatAttachment = async (asset: {
    uri: string;
    type?: string;
    fileName?: string;
  }) => {
    const formData = new FormData();
    formData.append(
      "file",
      {
        uri: asset.uri,
        type: asset.type || "application/octet-stream",
        name: asset.fileName || `chat-media-${Date.now()}`
      } as any
    );

    const response = await API.post("/upload-status-media", formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });

    const mediaUrl = response?.data?.mediaUrl || response?.data?.data?.mediaUrl || "";
    if (!mediaUrl || typeof mediaUrl !== "string") {
      throw new Error("Upload succeeded but media URL is missing.");
    }
    return mediaUrl;
  };

  const pickChatAttachment = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: "mixed",
        selectionLimit: 1,
        quality: 1
      });

      if (result.didCancel) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      setIsChatAttachmentUploading(true);
      const uploadedMediaUrl = await uploadChatAttachment({
        uri: asset.uri,
        type: asset.type || undefined,
        fileName: asset.fileName || undefined
      });

      setSelectedChatAttachment({
        uri: asset.uri,
        type: asset.type || undefined,
        fileName: asset.fileName || undefined,
        remoteUrl: uploadedMediaUrl
      });
    } catch (error) {
      console.log("Chat attachment error:", error);
      Alert.alert("Attachment Failed", "Unable to upload attachment right now.");
    } finally {
      setIsChatAttachmentUploading(false);
    }
  };

  const handleTextChange = (value: string) => {
    setText(value);

    if (senderId === null || isAIChat) return;

    if (value.trim().length > 0) {
      socket.emit("typing", {
        fromUserId: senderId,
        toUserId: receiverId
      });
    } else {
      socket.emit("stop-typing", {
        fromUserId: senderId,
        toUserId: receiverId
      });
    }

    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
    }

    typingStopTimerRef.current = setTimeout(() => {
      socket.emit("stop-typing", {
        fromUserId: senderId,
        toUserId: receiverId
      });
      typingStopTimerRef.current = null;
    }, 1200);
  };

  const handleRewriteMessage = async () => {
    if (!aiRewriteEnabled) return;
    if (!text.trim()) return;

    try {
      const response = await API.post("/rewrite-message", {
        message: text
      });

      const rewrittenText =
        response?.data?.rewrittenMessage ??
        response?.data?.rewritten_message ??
        response?.data?.message ??
        response?.data?.data?.rewrittenMessage ??
        response?.data?.data?.message ??
        "";

      if (!rewrittenText || typeof rewrittenText !== "string") {
        Alert.alert("Rewrite Failed", "No rewritten text returned.");
        return;
      }

      setText(rewrittenText.trim());
    } catch (error: any) {
      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Unable to rewrite message right now.";
      Alert.alert("Rewrite Failed", backendMessage);
    }
  };

  const messagesWithDate = useMemo(() => {
    return messages.map((item, index) => {
      const currentDate = getMessageDate(item);
      const previousDate =
        index > 0 ? getMessageDate(messages[index - 1]) : null;
      const showDateHeader =
        !previousDate || getDayKey(currentDate) !== getDayKey(previousDate);

      return {
        ...item,
        showDateHeader,
        dateLabel: getDateLabel(currentDate)
      };
    });
  }, [messages]);

  const latestOutgoingMessageId = useMemo(() => {
    if (!senderId) return null;
    let latestId: number | null = null;

    for (const item of messages) {
      if (item.sender_id === senderId && item.receiver_id === receiverId) {
        latestId = item.id;
      }
    }

    return latestId;
  }, [messages, senderId, receiverId]);

  const latestIncomingMessage = useMemo(() => {
    if (!senderId) return null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const item = messages[i];
      if (item.sender_id === receiverId && item.receiver_id === senderId) {
        return item;
      }
    }
    return null;
  }, [messages, senderId, receiverId]);

  const fetchSuggestedReplies = async (messageText: string) => {
    if (!messageText.trim()) return;

    try {
      setIsSuggestingReplies(true);
      const response = await API.post("/suggest-replies", {
        message: messageText
      });

      const payload = response?.data?.data ?? response?.data ?? {};
      const replies =
        payload?.suggestions ??
        payload?.suggested_replies ??
        payload?.replies ??
        payload?.suggestedReplies ??
        payload?.response ??
        [];

      const normalizeReply = (item: any) => {
        if (typeof item === "string") return item.trim();
        if (typeof item?.text === "string") return item.text.trim();
        if (typeof item?.message === "string") return item.message.trim();
        return "";
      };

      const normalizedReplies = Array.isArray(replies)
        ? replies.map(normalizeReply).filter((item) => item.length > 0).slice(0, 3)
        : [];

      setSuggestedReplies(normalizedReplies);
    } catch (error) {
      setSuggestedReplies([]);
    } finally {
      setIsSuggestingReplies(false);
    }
  };

  useEffect(() => {
    if (isAIChat || !aiSuggestionsEnabled) {
      setSuggestedReplies([]);
      return;
    }
    if (!latestIncomingMessage) return;
    if (lastSuggestedMessageIdRef.current === latestIncomingMessage.id) return;

    lastSuggestedMessageIdRef.current = latestIncomingMessage.id;
    fetchSuggestedReplies(latestIncomingMessage.message);
  }, [latestIncomingMessage, aiSuggestionsEnabled, isAIChat]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <View style={[styles.chatBody, { backgroundColor: colors.background }]}>
        {resolvedTheme === "dark" ? (
          <Image
            source={require("../assests/images/wall_paper_dark2.jpeg")}
            style={styles.chatWallpaper}
            resizeMode="contain"
          />
        ) : null}
        <FlatList
          ref={flatListRef}
          data={messagesWithDate}
          keyExtractor={(item, index) =>
            typeof item.id === "number"
              ? `message-${item.id}`
              : `message-fallback-${index}`
          }
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => {
            if (shouldAutoScrollRef.current) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
          ListFooterComponent={
            showTypingIndicator ? (
              <View
                style={[
                  styles.messageBubble,
                  styles.theirMessageBubble,
                  { backgroundColor: colors.card },
                  styles.typingBubble
                ]}
              >
                <Text
                  style={[styles.messageText, styles.theirMessageText, styles.typingText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {isAIChat &&
                  (aiHubAction === "speechToText" || aiHubAction === "voiceAgent")
                    ? `Chattr AI is speaking${typingDots}`
                    : isAIChat
                    ? `Chattr AI is typing${typingDots}`
                    : `Typing${typingDots}`}
                </Text>
              </View>
            ) : null
          }
          onScroll={(event) => {
            const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
            const distanceFromBottom =
              contentSize.height - (layoutMeasurement.height + contentOffset.y);
            shouldAutoScrollRef.current = distanceFromBottom < 80;
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const parsedAttachment = parseChatAttachmentFromMessage(item.message);
            const attachmentUrl = parsedAttachment?.url || "";
            const attachmentCaption = parsedAttachment?.caption || "";
            const hasImageAttachment = Boolean(attachmentUrl && isLikelyImageUrl(attachmentUrl));
            const hasVideoAttachment = Boolean(attachmentUrl && isLikelyVideoUrl(attachmentUrl));
            const hasGenericAttachment =
              Boolean(parsedAttachment) && !hasImageAttachment && !hasVideoAttachment;
            const hasRenderableAttachment =
              hasImageAttachment || hasVideoAttachment || hasGenericAttachment;

            return (
              <>
                {item.showDateHeader ? (
                  <View style={[styles.dateChip, { backgroundColor: colors.chipBackground }]}>
                    <Text style={[styles.dateChipText, { color: colors.chipText }]}>{item.dateLabel}</Text>
                  </View>
                ) : null}
                <View
                  style={[
                    styles.messageBubble,
                    item.sender_id === senderId
                      ? [styles.myMessageBubble, { backgroundColor: colors.primary }]
                      : [styles.theirMessageBubble, { backgroundColor: colors.card }]
                  ]}
                >
                  {hasImageAttachment ? (
                    <Image source={{ uri: attachmentUrl }} style={styles.generatedImage} resizeMode="cover" />
                  ) : null}
                  {hasVideoAttachment ? (
                    <Video
                      source={{ uri: attachmentUrl }}
                      style={styles.generatedImage}
                      resizeMode="cover"
                      paused
                      controls
                    />
                  ) : null}
                  {hasGenericAttachment ? (
                    <TouchableOpacity
                      style={[styles.audioButton, { borderColor: colors.border }]}
                      onPress={() => {
                        Linking.openURL(attachmentUrl).catch(() => {
                          Alert.alert("Open Failed", "Unable to open attachment.");
                        });
                      }}
                    >
                      <Text style={[styles.audioButtonText, { color: colors.primary }]}>Open Attachment</Text>
                    </TouchableOpacity>
                  ) : null}
                  {item.image_url ? (
                    <Image
                      source={{ uri: toAbsoluteImageUrl(item.image_url) || item.image_url }}
                      style={styles.generatedImage}
                      resizeMode="cover"
                      onError={(event) => {
                        console.log("[AIHub] image render failed", {
                          original: item.image_url,
                          resolved: toAbsoluteImageUrl(item.image_url),
                          error: event?.nativeEvent
                        });
                      }}
                    />
                  ) : null}
                  {item.audio_url ? (
                    <View style={styles.audioActionsRow}>
                      <TouchableOpacity
                        style={[styles.audioButton, { borderColor: colors.border }]}
                        onPress={() => {
                          const resolvedAudioUrl =
                            toAbsoluteImageUrl(item.audio_url) || item.audio_url;
                          if (!resolvedAudioUrl) {
                            Alert.alert("Audio Error", "Generated audio URL is missing.");
                            return;
                          }

                          if (playingAudioMessageId === item.id) {
                            setIsAudioPaused((prev) => !prev);
                            return;
                          }

                          setPlayingAudioMessageId(item.id);
                          setPlayingAudioUrl(resolvedAudioUrl);
                          setIsAudioPaused(false);
                          setAudioPlayerSessionKey((prev) => prev + 1);
                        }}
                      >
                        <Text style={[styles.audioButtonText, { color: colors.primary }]}>
                          {playingAudioMessageId === item.id && !isAudioPaused
                            ? "⏸ Pause Audio"
                            : "▶ Play Audio"}
                        </Text>
                      </TouchableOpacity>

                      {aiHubAction !== "voiceAgent" ? (
                        <TouchableOpacity
                          style={[styles.audioButton, { borderColor: colors.border }]}
                          onPress={async () => {
                            const resolvedAudioUrl =
                              toAbsoluteImageUrl(item.audio_url) || item.audio_url;
                            if (!resolvedAudioUrl) {
                              Alert.alert("Download Error", "Generated audio URL is missing.");
                              return;
                            }

                            try {
                              await Share.share({
                                message: resolvedAudioUrl,
                                url: resolvedAudioUrl,
                                title: "Download Audio"
                              });
                            } catch (error) {
                              console.log("[AIHub] audio share/download failed", {
                                original: item.audio_url,
                                resolved: resolvedAudioUrl,
                                error
                              });
                              Alert.alert(
                                "Download Failed",
                                "Unable to download audio right now."
                              );
                            }
                          }}
                        >
                          <Text style={[styles.audioButtonText, { color: colors.primary }]}>
                            ⬇ Download
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                  {!hasRenderableAttachment || attachmentCaption ? (
                    <Text
                      style={[
                        styles.messageText,
                        item.sender_id === senderId
                          ? styles.myMessageText
                          : [styles.theirMessageText, { color: colors.text }]
                      ]}
                    >
                      {formatMessageForDisplay(attachmentCaption || item.message)}
                    </Text>
                  ) : null}
                  {item.sender_id === senderId &&
                  item.id === latestOutgoingMessageId ? (
                    <Text style={styles.messageStatusText}>
                      {seenMessageIds.has(item.id) || isMessageSeen(item)
                        ? "Seen"
                        : "Sent"}
                    </Text>
                  ) : null}
                </View>
              </>
            );
          }}
        />
      </View>

      {!isAIChat && aiSuggestionsEnabled && (isSuggestingReplies || suggestedReplies.length > 0) ? (
        <View style={[styles.inputRow, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View
            style={[
              styles.suggestionWrapper,
              {
                backgroundColor: colors.card,
                borderColor: colors.border
              }
            ]}
          >
            {isSuggestingReplies ? (
              <Text style={[styles.suggestionLoadingText, { color: colors.secondaryText }]}>
                Suggesting replies...
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestionRow}
              >
                {suggestedReplies.map((suggestion, index) => (
                  <TouchableOpacity
                    key={`reply-${index}`}
                    style={[
                      styles.suggestionChip,
                      { backgroundColor: colors.chipBackground, borderColor: colors.border }
                    ]}
                    onPress={() => {
                      void trackEvent("suggested_reply_clicked", {
                        receiver_id: receiverId,
                        suggestion_index: index + 1
                      });
                      setText(suggestion);
                    }}
                  >
                    <Text style={[styles.suggestionText, { color: colors.text }]} numberOfLines={1}>
                      {suggestion}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      ) : null}

      {isAIChat && aiHubAction === "modes" ? (
        <View style={[styles.inputRow, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={styles.modesWrap}>
            <Text style={[styles.modesTitle, { color: colors.secondaryText }]}>
              Select mode first
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {AI_MODE_OPTIONS.map((mode) => {
                const isSelected = selectedAIHubMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.modeChip,
                      {
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected ? colors.primary : colors.chipBackground
                      }
                    ]}
                    onPress={() => setSelectedAIHubMode(mode)}
                  >
                    <Text
                      style={[
                        styles.modeChipText,
                        { color: isSelected ? "#fff" : colors.text }
                      ]}
                    >
                      {mode}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      ) : null}

      {!isAIChat && selectedChatAttachment ? (
        <View
          style={[
            styles.attachmentPreviewRow,
            { backgroundColor: colors.card, borderTopColor: colors.border }
          ]}
        >
          <Paperclip size={16} color={colors.primary} strokeWidth={2.2} />
          <View style={styles.attachmentMeta}>
            <Text
              style={[styles.attachmentPreviewText, { color: colors.secondaryText }]}
              numberOfLines={1}
            >
              {isChatAttachmentUploading
                ? "Uploading attachment..."
                : selectedChatAttachment.fileName || "media"}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setSelectedChatAttachment(null)}>
            <X size={18} color={colors.secondaryText} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      ) : null}

      {isAnalyzerMode && selectedAnalyzerFile ? (
        <View
          style={[
            styles.attachmentPreviewRow,
            { backgroundColor: colors.card, borderTopColor: colors.border }
          ]}
        >
          <FileText size={16} color={colors.primary} strokeWidth={2.2} />
          <View style={styles.attachmentMeta}>
            <Text
              style={[styles.attachmentPreviewText, { color: colors.secondaryText }]}
              numberOfLines={1}
            >
              {selectedAnalyzerFile.fileName || "file"}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setSelectedAnalyzerFile(null)}>
            <X size={18} color={colors.secondaryText} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border
          },
          isVoiceCaptureMode ? styles.sttInputRow : null,
          isAnalyzerMode ? styles.analyzerInputRow : null
        ]}
      >
        {!isAIChat && !isVoiceCaptureMode && !isAnalyzerMode ? (
          <TouchableOpacity
            style={[styles.rewriteButton, styles.pinButton, { borderColor: colors.border }]}
            onPress={pickChatAttachment}
            disabled={isChatAttachmentUploading}
          >
            <View style={styles.pinIconWrap}>
              <Paperclip
                size={18}
                color={
                  selectedChatAttachment?.remoteUrl
                    ? colors.primary
                    : colors.secondaryText
                }
                strokeWidth={2.2}
              />
            </View>
          </TouchableOpacity>
        ) : null}

        {!isVoiceCaptureMode && !isAnalyzerMode ? (
          <TextInput
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.inputBackground,
                color: colors.text
              }
            ]}
            value={text}
            onChangeText={handleTextChange}
            placeholder="Type a message..."
            placeholderTextColor={colors.secondaryText}
          />
        ) : null}

        {isAnalyzerMode ? (
          <TouchableOpacity
            style={[styles.rewriteButton, styles.pinButton, { borderColor: colors.border }]}
            onPress={pickAnalyzerFile}
            disabled={isAnalyzerUploading}
          >
            <View style={styles.pinIconWrap}>
              <FileText
                size={18}
                color={selectedAnalyzerFile ? colors.primary : colors.secondaryText}
                strokeWidth={2.2}
              />
            </View>
          </TouchableOpacity>
        ) : null}

        {isVoiceCaptureMode ? (
          <TouchableOpacity
            style={[
              styles.recordButton,
              isVoiceCaptureMode ? styles.recordButtonCentered : null,
              {
                borderColor: colors.border,
                backgroundColor: isSpeechToTextProcessing
                  ? colors.secondaryText
                  : isSpeechRecording
                  ? colors.danger
                  : colors.primary
              }
            ]}
            onPress={handleRecordAndTranscribe}
            disabled={isSpeechToTextProcessing}
          >
            <Text style={styles.recordButtonText}>
              {isSpeechToTextProcessing ? "..." : isSpeechRecording ? "■" : "🎙"}
            </Text>
          </TouchableOpacity>
        ) : null}

        {!isAIChat && aiRewriteEnabled ? (
          <TouchableOpacity
            style={[styles.rewriteButton, { borderColor: colors.border }]}
            onPress={handleRewriteMessage}
            disabled={!text.trim()}
          >
            <Text
              style={[
                styles.rewriteButtonText,
                { color: text.trim() ? colors.primary : colors.secondaryText }
              ]}
            >
              ✦✦✦
            </Text>
          </TouchableOpacity>
        ) : null}

        {!isVoiceCaptureMode ? (
          <TouchableOpacity
            style={[
              styles.sendButton,
              {
                backgroundColor:
                  isAIChat && aiHubAction === "modes" && !selectedAIHubMode
                    ? colors.secondaryText
                    : colors.primary
              }
            ]}
            onPress={sendMessage}
            disabled={
              (isAIChat && aiHubAction === "modes" && !selectedAIHubMode) ||
              isAnalyzerUploading ||
              (isAnalyzerMode && !selectedAnalyzerFile) ||
              isChatAttachmentUploading
            }
          >
            <Text style={styles.sendButtonText}>{isAnalyzerUploading ? "..." : "Send"}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {playingAudioUrl ? (
        <Video
          key={`audio-player-${audioPlayerSessionKey}`}
          source={{ uri: playingAudioUrl }}
          paused={isAudioPaused}
          style={styles.hiddenAudioPlayer}
          playInBackground={false}
          playWhenInactive={false}
          ignoreSilentSwitch="ignore"
          onEnd={() => {
            setIsAudioPaused(true);
            setPlayingAudioMessageId(null);
          }}
          onError={(error) => {
            console.log("[AIHub] in-chat audio play failed", {
              url: playingAudioUrl,
              error
            });
            setIsAudioPaused(true);
            setPlayingAudioMessageId(null);
            Alert.alert("Audio Error", "Unable to play this audio in chat.");
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
};

export default ChatScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  navHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 230
  },
  navAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10
  },
  navAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  navAvatarInitial: {
    fontSize: 15,
    fontWeight: "700"
  },
  navTextWrap: {
    flexShrink: 1
  },
  navNameText: {
    fontSize: 16,
    fontWeight: "700"
  },
  navStatusText: {
    marginTop: 1,
    fontSize: 12
  },
  chatBody: {
    flex: 1,
    backgroundColor: "#f3f4f6"
  },
  chatWallpaper: {
    ...StyleSheet.absoluteFillObject
  },
  typingBubble: {
    maxWidth: 220,
    minWidth: 120
  },
  typingText: {
    lineHeight: 18
  },
  messagesContent: {
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  dateChip: {
    alignSelf: "center",
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 8,
    marginBottom: 4
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151"
  },
  messageBubble: {
    maxWidth: "78%",
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginVertical: 4,
    borderRadius: 14
  },
  myMessageBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#7423d7",
    borderBottomRightRadius: 6
  },
  theirMessageBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 6
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20
  },
  generatedImage: {
    width: 220,
    height: 220,
    borderRadius: 10,
    marginBottom: 8
  },
  audioButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 8
  },
  audioActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8
  },
  audioButtonText: {
    fontSize: 13,
    fontWeight: "600"
  },
  hiddenAudioPlayer: {
    width: 0,
    height: 0,
    opacity: 0
  },
  myMessageText: {
    color: "#ffffff"
  },
  theirMessageText: {
    color: "#111827"
  },
  emptyText: {
    textAlign: "center",
    color: "#6b7280",
    marginTop: 24
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#ffffff"
  },
  suggestionWrapper: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8
  },
  suggestionRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center"
  },
  suggestionChip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 90
  },
  suggestionText: {
    fontSize: 13,
    textAlign: "center"
  },
  suggestionLoadingText: {
    fontSize: 13
  },
  attachmentPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    gap: 8
  },
  attachmentPreviewText: {
    fontSize: 13
  },
  modesWrap: {
    width: "100%"
  },
  modesTitle: {
    fontSize: 12,
    marginBottom: 8
  },
  modeChip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8
  },
  modeChipText: {
    fontSize: 13,
    fontWeight: "600"
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#f9fafb",
    marginRight: 8
  },
  rewriteButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8
  },
  rewriteButtonText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5
  },
  pinIconWrap: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center"
  },
  pinButton: {
    padding: 0,
    alignSelf: "center"
  },
  recordButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8
  },
  recordButtonCentered: {
    marginRight: 0
  },
  sttInputRow: {
    justifyContent: "center"
  },
  analyzerInputRow: {
    justifyContent: "center"
  },
  recordButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14
  },
  sendButton: {
    backgroundColor: "#7423d7",
    minWidth: 58,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center"
  },
  sendButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    lineHeight: 16,
    includeFontPadding: false,
    textAlignVertical: "center"
  },
  messageStatusText: {
    marginTop: 4,
    fontSize: 11,
    textAlign: "right",
    color: "#ede9fe"
  },
  attachmentMeta: {
    flex: 1
  }
});
