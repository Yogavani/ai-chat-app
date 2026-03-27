const USER = {
    GET_USERS: "/users",
    DELETE_ACCOUNT: "/delete-account/:userId",
    REGISTER: "/register",
    LOGIN: "/login",
    SEND_MESSAGE: "/send-message",
    REWRITE_MESSAGE: "/rewrite-message",
    SUGGEST_REPLIES: "/suggest-replies",
    RECEIVE_MESSAGE: "/receive-message/:senderId/:receiverId",
    UPLOAD_PROFILE_IMAGE: "/upload-profile-image/:userId",
    UPDATE_ABOUT: "/update-about/:userId",
  };
  
  module.exports = { USER };
