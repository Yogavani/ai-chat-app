export interface User {
    id: number;
    name: string;
    email: string;
}

export type MainTabParamList = {
    Home: undefined;
    AIChat: undefined;
    Status: undefined;
    Settings: undefined;
};

export type RootStackParamList = {
    Login: undefined;
    Register: undefined;
    MainTabs: undefined;
    Chat: { 
        receiverId: number;
        receiverName: string;
        receiverProfileImage?: string;
        aiHubAction?:
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
        aiHubMode?: string;
     };
    Profile: {
        userId: number;
        userName: string;
        userEmail?: string;
        profileImage?: string;
        about?: string;
    };
    Premium: undefined;
    ChatScreen: {
        receiverId: number;
        receiverName: string;
      };
};
