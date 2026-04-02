import axios from "axios";

const API = axios.create({
  baseURL: "https://ai-chat-app-s971.onrender.com"
});

export default API;