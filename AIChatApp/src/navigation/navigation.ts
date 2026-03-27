export interface User {
    id: number;
    name: string;
    email: string;
}

export type MainTabParamList = {
    Home: undefined;
    AIChat: undefined;
    Explore: undefined;
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
     };
    Profile: {
        userId: number;
        userName: string;
        userEmail?: string;
        profileImage?: string;
        about?: string;
    };
    ChatScreen: {
        receiverId: number;
        receiverName: string;
      };
};
