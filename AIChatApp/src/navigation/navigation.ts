export interface User {
    id: number;
    name: string;
    email: string;
}


export type RootStackParamList = {
    Login: undefined;
    Register: undefined;
    Home: undefined;
    Chat: { 
        receiverId: number;
        receiverName: string;
     };
    ChatScreen: {
        receiverId: number;
        receiverName: string;
      };
};

