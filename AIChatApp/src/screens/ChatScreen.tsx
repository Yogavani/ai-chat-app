import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform
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

type ChatScreenRouteProp = RouteProp<RootStackParamList, "Chat">;

type Props = {
  route: ChatScreenRouteProp;
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

const ChatScreen = ({ route }: Props) => {
  const { colors } = useAppTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [senderId, setSenderId] = useState<number | null>(null);
  const [seenMessageIds, setSeenMessageIds] = useState<Set<number>>(new Set());
  const [isReceiverTyping, setIsReceiverTyping] = useState(false);
  const [isReceiverOnline, setIsReceiverOnline] = useState(false);
  const [typingDots, setTypingDots] = useState(".");
  const { receiverId, receiverName } = route.params;
  const flatListRef = useRef<FlatList>(null);
  const shouldAutoScrollRef = useRef(true);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSenderId();
  }, []);

  useEffect(() => {
    if (senderId !== null) {
      fetchMessages();
    }
  }, [senderId, receiverId]);

  useEffect(() => {
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
  }, [messages, senderId, receiverId, seenMessageIds]);

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
    };
  }, [senderId, receiverId]);

  useEffect(() => {
    console.log("TYPING STATE:", isReceiverTyping);
  }, [isReceiverTyping]);

  useEffect(() => {
    if (!isReceiverTyping) {
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
  }, [isReceiverTyping]);

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
      const response = await API.post("/send-message", {
        sender_id: senderId,
        receiver_id: receiverId,
        message: text,
      });
      console.log("NEW MESSAGESSS:", response.data);
      const newMessage = {
        ...response.data,
        client_created_at: Date.now()
      };
      setMessages((prev) => mergeMessages([...prev, newMessage]));
      setText("");
      socket.emit("stop-typing", {
        fromUserId: senderId,
        toUserId: receiverId
      });
    } catch (error) {
      console.log("Send message error:", error);
    }
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (senderId === null) return;

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

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{receiverName}</Text>
        <Text style={[styles.headerSubtitle, { color: colors.secondaryText }]}>
          {isReceiverOnline ? "online" : "offline"}
        </Text>
      </View>

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
            isReceiverTyping ? (
              <View
                style={[
                  styles.messageBubble,
                  styles.theirMessageBubble,
                  { backgroundColor: colors.card },
                  styles.typingBubble
                ]}
              >
                <Text style={[styles.messageText, styles.theirMessageText, { color: colors.text }]}>
                  {`Typing${typingDots}`}
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
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#ffffff"
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827"
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: "#4b5563"
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
