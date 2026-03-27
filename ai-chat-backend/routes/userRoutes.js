const userHandler = require("../controllers/userController");
const { USER } = require("../constants/messages");

async function userRoutes(server, options) {

  server.get(USER.GET_USERS, userHandler.getUsers);
  server.post(USER.REGISTER, userHandler.registerUser);
  server.post(USER.DELETE_ACCOUNT, userHandler.deleteAccount);
  server.post(USER.LOGIN, userHandler.loginUser);
  server.post(USER.SEND_MESSAGE, userHandler.sendMessage);
  server.post(USER.REWRITE_MESSAGE, userHandler.rewriteMessage);
  server.post(USER.SUGGEST_REPLIES, userHandler.suggestReplies);
  server.get(USER.RECEIVE_MESSAGE, userHandler.getMessages);
  server.post(USER.UPLOAD_PROFILE_IMAGE, userHandler.uploadProfileImage);
  server.post(USER.UPDATE_ABOUT, userHandler.updateAbout);
}

module.exports = userRoutes;
