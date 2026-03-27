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
  ScrollView
} from "react-native";
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
  created_at?: string;
  client_created_at?: number;
  is_seen?: boolean;
  seen_at?: string;
};

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
    .filter((item) => item.sender_id === currentUserId || item.sender_id === 9999)
    .slice(-20)
    .map((item) => ({
      role: item.sender_id === currentUserId ? "user" : "assistant",
      content: item.message
    }));
};

const ChatScreen = ({ route, navigation }: Props) => {
  const { colors } = useAppTheme();
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
  const { receiverId, receiverName, receiverProfileImage } = route.params;
  const isAIChat = receiverId === 9999;
  const flatListRef = useRef<FlatList>(null);
  const shouldAutoScrollRef = useRef(true);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiReplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSuggestedMessageIdRef = useRef<number | null>(null);
  const suggestionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSenderId();
  }, []);

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
    const statusText = isAIChat
      ? isAITyping
        ? "typing..."
        : "AI assistant"
      : isReceiverTyping
      ? "typing..."
      : isReceiverOnline
      ? "online"
      : "offline";

    const profileImage = toAbsoluteImageUrl(receiverProfileImage || "");

    navigation.setOptions({
      headerTitleAlign: "left",
      headerTitle: () => (
        <View style={styles.navHeaderContent}>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={styles.navAvatar} />
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
    isAITyping,
    isReceiverTyping,
    isReceiverOnline,
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

    socket.emit("message-seen", {
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
        socket.emit("message-seen", {
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

    const onUserOnline = (payload: any) => {
      if (payload?.userId === receiverId) {
        setIsReceiverOnline(true);
      }
    };

    const onUserOffline = (payload: any) => {
      if (payload?.userId === receiverId) {
        setIsReceiverOnline(false);
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
    socket.on("user-online", onUserOnline);
    socket.on("user-offline", onUserOffline);
    socket.on("message-seen", onMessageSeen);
    socket.on("messages-seen", onMessageSeen);

    if (socket.connected) {
      onConnect();
    } else {
      ensureSocketConnection();
    }

    socket.emit("presence:watch", {
      watcherId: senderId,
      targetUserId: receiverId
    });
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
      socket.off("user-online", onUserOnline);
      socket.off("user-offline", onUserOffline);
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
      if (suggestionDebounceRef.current) {
        clearTimeout(suggestionDebounceRef.current);
        suggestionDebounceRef.current = null;
      }
    };
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
      setMessages(mergeMessages(normalizedMessages));
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
    if (!text.trim()) return;
  
    try {
      const pendingText = text;
      if (isAIChat) {
        setIsAITyping(true);
      }
      const requestPayload = isAIChat
        ? {
            sender_id: senderId,
            receiver_id: receiverId,
            message: pendingText,
            conversationContext: buildAIConversationContext(messages, senderId)
          }
        : {
            sender_id: senderId,
            receiver_id: receiverId,
            message: pendingText
          };

      const response = await API.post("/send-message", requestPayload);
      console.log("NEW MESSAGESSS:", response.data);
      const payload =
        response.data?.data ??
        response.data?.result ??
        response.data ??
        {};

      const isAIFlowResponse = Boolean(
        payload?.isAIFlow ||
        payload?.is_ai_flow ||
        (payload?.userMessage && payload?.aiMessage) ||
        (payload?.user_message && payload?.ai_message)
      );

      const userMessagePayload = payload?.userMessage ?? payload?.user_message;
      const aiMessagePayload = payload?.aiMessage ?? payload?.ai_message;

      if (isAIFlowResponse && userMessagePayload && aiMessagePayload) {
        const userMessage = {
          ...userMessagePayload,
          client_created_at: Date.now()
        } as Message;
        const aiMessage = {
          ...aiMessagePayload,
          client_created_at: Date.now()
        } as Message;
        setMessages((prev) => mergeMessages([...prev, userMessage]));

        const aiReplyDelayMs = 1400;
        await new Promise<void>((resolve) => {
          if (aiReplyTimerRef.current) {
            clearTimeout(aiReplyTimerRef.current);
          }
          aiReplyTimerRef.current = setTimeout(() => {
            setMessages((prev) => mergeMessages([...prev, aiMessage]));
            setIsAITyping(false);
            aiReplyTimerRef.current = null;
            resolve();
          }, aiReplyDelayMs);
        });
      } else {
        // For AI flow or non-standard payloads, refresh from server source of truth.
        if (isAIChat) {
          await fetchMessages();
        } else {
          const newMessage = {
            ...payload,
            client_created_at: Date.now()
          } as Message;
          setMessages((prev) => mergeMessages([...prev, newMessage]));
        }
      }

      setText("");
      setSuggestedReplies([]);
      if (!isAIChat) {
        socket.emit("stop-typing", {
          fromUserId: senderId,
          toUserId: receiverId
        });
      }
    } catch (error: any) {
      console.log("Send message error:", error);
      const statusCode = error?.response?.status;
      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Unable to send message right now.";

      if (isAIChat) {
        await fetchMessages();

        if (statusCode === 429) {
          const localRateLimitNotice: Message = {
            id: -Date.now(),
            sender_id: receiverId,
            receiver_id: senderId,
            message:
              "Chattr AI is busy right now (rate limit reached). Please wait a few seconds and try again.",
            client_created_at: Date.now()
          };
          setMessages((prev) => mergeMessages([...prev, localRateLimitNotice]));
        } else {
          Alert.alert("AI Reply Failed", backendMessage);
        }
      } else {
        Alert.alert("Send Failed", backendMessage);
      }
    } finally {
      if (isAIChat && !aiReplyTimerRef.current) {
        setIsAITyping(false);
      }
    }
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (!aiSuggestionsEnabled) return;

    if (suggestionDebounceRef.current) {
      clearTimeout(suggestionDebounceRef.current);
    }
    if (value.trim().length > 2) {
      suggestionDebounceRef.current = setTimeout(() => {
        fetchSuggestedReplies(value);
      }, 450);
    }

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
    if (!aiSuggestionsEnabled) {
      setSuggestedReplies([]);
      return;
    }
    if (!latestIncomingMessage) return;
    if (lastSuggestedMessageIdRef.current === latestIncomingMessage.id) return;

    lastSuggestedMessageIdRef.current = latestIncomingMessage.id;
    fetchSuggestedReplies(latestIncomingMessage.message);
  }, [latestIncomingMessage, aiSuggestionsEnabled]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <View style={[styles.chatBody, { backgroundColor: colors.background }]}>
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
                <Text style={[styles.messageText, styles.theirMessageText, { color: colors.text }]}>
                  {isAIChat ? `Chattr AI is typing${typingDots}` : `Typing${typingDots}`}
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
          renderItem={({ item }) => (
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
                <Text
                  style={[
                    styles.messageText,
                    item.sender_id === senderId
                      ? styles.myMessageText
                      : [styles.theirMessageText, { color: colors.text }]
                  ]}
                >
                  {item.message}
                </Text>
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
          )}
        />
      </View>

      {aiSuggestionsEnabled && (isSuggestingReplies || suggestedReplies.length > 0) ? (
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

      <View style={[styles.inputRow, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
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

        {aiRewriteEnabled ? (
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

        <TouchableOpacity style={[styles.sendButton, { backgroundColor: colors.primary }]} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
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
  typingBubble: {
    maxWidth: 90,
    minWidth: 48
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
    backgroundColor: "#2563eb",
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
  sendButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20
  },
  sendButtonText: {
    color: "#ffffff",
    fontWeight: "600"
  },
  messageStatusText: {
    marginTop: 4,
    fontSize: 11,
    textAlign: "right",
    color: "#dbeafe"
  }
});
