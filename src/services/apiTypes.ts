export interface LoginResponse {
    token: string;
    userId?: number;
    user?: {
      id: number;
    };
}
