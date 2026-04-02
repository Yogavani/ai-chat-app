import { io } from "socket.io-client";
import API from "./api";

const resolveSocketUrl = () => {
  const baseURL = API.defaults.baseURL || "";
  if (typeof baseURL !== "string" || baseURL.trim().length === 0) {
    return "http://localhost:5000";
  }
  return baseURL.replace(/\/+$/, "");
};

const SOCKET_URL = resolveSocketUrl();

export const socket = io(SOCKET_URL, {
  // Keep both transports so Render/proxy setups can fall back cleanly.
  transports: ["websocket", "polling"],
  autoConnect: false,
  reconnection: true
});

export const ensureSocketConnection = () => {
  if (!socket.connected) {
    socket.connect();
  }
};
