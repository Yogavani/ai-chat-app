const userHandler = require("../controllers/userController");
const { USER } = require("../constants/messages");

async function userRoutes(server, options) {

  server.get(USER.GET_USERS, userHandler.getUsers);
  server.post(USER.REGISTER, userHandler.registerUser);
  server.post(USER.DELETE_ACCOUNT, userHandler.deleteAccount);
  server.post(USER.LOGIN, userHandler.loginUser);
  server.post(USER.SEND_MESSAGE, userHandler.sendMessage);
  server.post(USER.CREATE_STATUS, userHandler.createStatus);
  server.post(USER.DELETE_STATUS, userHandler.deleteStatus);
  server.post(USER.MARK_STATUS_VIEW, userHandler.markStatusView);
  server.post(USER.AI_REWRITE, userHandler.aiRewrite);
  server.post(USER.AI_GENERATE_REPLIES, userHandler.aiGenerateReplies);
  server.post(USER.AI_SUMMARIZE_CHAT, userHandler.aiSummarizeChat);
  server.post(USER.AI_ASK, userHandler.aiAsk);
  server.post(USER.AI_GENERATE_IMAGE, userHandler.aiGenerateImage);
  server.post(USER.AI_TEXT_TO_SPEECH, userHandler.aiTextToSpeech);
  server.post(USER.AI_SPEECH_TO_TEXT, userHandler.aiSpeechToText);
  server.post(USER.AI_VOICE_AGENT, userHandler.aiVoiceAgent);
  server.post(USER.AI_DOCUMENT_ANALYZER, userHandler.aiDocumentAnalyzer);
  server.post(USER.AI_IMAGE_UNDERSTANDING, userHandler.aiImageUnderstanding);
  server.get(USER.GET_STATUS_POSTS, userHandler.getStatusPosts);
  server.get(USER.GET_STATUS_VIEWS, userHandler.getStatusViews);
  server.post(USER.REWRITE_MESSAGE, userHandler.rewriteMessage);
  server.post(USER.SUGGEST_REPLIES, userHandler.suggestReplies);
  server.get(USER.RECEIVE_MESSAGE, userHandler.getMessages);
  server.post(USER.UPLOAD_PROFILE_IMAGE, userHandler.uploadProfileImage);
  server.post(USER.UPLOAD_STATUS_MEDIA, userHandler.uploadStatusMedia);
  server.post(USER.UPDATE_ABOUT, userHandler.updateAbout);
  server.post(USER.UPDATE_FCM_TOKEN, userHandler.updateFcmToken);
  server.post(USER.CREATE_PAYMENT, userHandler.createPayment);
  server.get(USER.GET_PREMIUM_STATUS, userHandler.getPremiumStatus);
}

module.exports = userRoutes;
