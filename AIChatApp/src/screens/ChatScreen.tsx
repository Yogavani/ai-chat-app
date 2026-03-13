import React, { useEffect, useState } from "react";
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
import { socket } from "../services/socket";

type ChatScreenRouteProp = RouteProp<RootStackParamList, "Chat">;

type Props = {
  route: ChatScreenRouteProp;
};

type Message = {
  id: number;
  sender_id: number;
  receiver_id: number;
  message: string;
};

const ChatScreen = ({ route }: Props) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [senderId, setSenderId] = useState<number | null>(null);
  const { receiverId, receiverName } = route.params;

  useEffect(() => {
    loadSenderId();
  }, []);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected to socket server:", socket.id);
    });
  
    return () => {
      socket.off("connect");
    };
  }, []);

  useEffect(() => {
    if (senderId !== null) {
      fetchMessages();
    }
  }, [senderId, receiverId]);

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
      const response = await fetch(
        `http://YOUR_IP:3000/messages/${senderId}/${receiverId}`
      )
  
      const data = await response.json()
  
      setMessages(data);
    } catch (error) {
      console.log("Fetch messages error:", error);
    }
  };

  const sendMessage = async () => {
    if (senderId === null) return;
    if (!text.trim()) return
  
    try {
      const response = await fetch("http://YOUR_IP:3000/send-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender_id: senderId,
          receiver_id: receiverId,
          message: text,
        }),
      })
  
      const newMessage = await response.json()
  
      setMessages((prev) => [...prev, newMessage]);
  
      setText("");
    } catch (error) {
      console.log("Send message error:", error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{receiverName}</Text>
      </View>

      <View style={styles.chatBody}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageBubble,
                item.sender_id === senderId
                  ? styles.myMessageBubble
                  : styles.theirMessageBubble
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  item.sender_id === senderId
                    ? styles.myMessageText
                    : styles.theirMessageText
                ]}
              >
                {item.message}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No messages yet. Start chatting.</Text>
          }
        />
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor="#9ca3af"
        />

        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
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
  chatBody: {
    flex: 1,
    backgroundColor: "#f3f4f6"
  },
  messagesContent: {
    paddingHorizontal: 12,
    paddingVertical: 10
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
  }
});
