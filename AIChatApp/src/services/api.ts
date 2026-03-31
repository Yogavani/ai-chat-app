import axios from "axios";

export const BACKEND_BASE_URL = "https://ai-chat-app-s971.onrender.com";

const API = axios.create({
  baseURL: BACKEND_BASE_URL
});

export default API;
