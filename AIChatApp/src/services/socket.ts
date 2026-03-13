import { io } from "socket.io-client";

const SOCKET_URL = "http://YOUR_IP:5000";

export const socket = io(SOCKET_URL, {
  transports: ["websocket"]
});