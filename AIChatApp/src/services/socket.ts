import { io } from "socket.io-client";
import { BACKEND_BASE_URL } from "./api";

const SOCKET_URL = BACKEND_BASE_URL;

export const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  autoConnect: false
});

export const ensureSocketConnection = () => {
  if (!socket.connected) {
    socket.connect();
  }
};
