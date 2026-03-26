export interface User {
    id: number;
    name: string;
    email: string;
}


export type RootStackParamList = {
    Login: undefined;
    Register: undefined;
    Home: undefined;
    Settings: undefined;
    Chat: { 
        receiverId: number;
        receiverName: string;
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
