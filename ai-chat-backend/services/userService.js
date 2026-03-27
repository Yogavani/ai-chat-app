const userDao = require("../dao/userDao");
const messageDao = require("../dao/userDao");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {
  getAIReply,
  rewriteWithAI,
  generateSuggestions,
  generateAutoReply
} = require("./aiService");
const AI_BOT_USER_ID = 9999;
const MAX_AI_CONTEXT_MESSAGES = 20;
const AUTO_REPLY_DELAY_MS = Number(process.env.AUTO_REPLY_DELAY_MS || 10000);

function triggerAutoReply(senderId, receiverId, message) {
  setTimeout(async () => {
    try {
      const latestMessages = await messageDao.getMessages(senderId, receiverId);
      const lastMessage = latestMessages[latestMessages.length - 1];

      if (!lastMessage) {
        return;
      }

      if (Number(lastMessage.sender_id) !== Number(senderId)) {
        return;
      }

      const aiReply = await generateAutoReply(message);

      await messageDao.sendMessage({
        sender_id: receiverId,
        receiver_id: senderId,
        message: `(Auto): ${aiReply}`
      });
    } catch (error) {
      console.error("Auto reply error:", error);
    }
  }, AUTO_REPLY_DELAY_MS);
}


exports.getUsers = async () => {
  return await userDao.getUsers();
};

exports.registerUser = async (data) => {

  const hashedPassword = await bcrypt.hash(data.password, 10);

  const user = {
    name: data.name,
    email: data.email,
    password: hashedPassword
  };

  const result = await userDao.createUser(user);
  return {
    message: "User registered successfully",
    userId: result.insertId
  };
};

exports.loginUser = async (data) => {

  const user = await userDao.getUserByEmail(data.email);

  if (!user) {
    throw { message: "User not found" };
  }

  const passwordMatch = await bcrypt.compare(
    data.password,
    user.password
  );

  if (!passwordMatch) {
    throw { message: "Invalid password" };
  }

  const token = jwt.sign(
    { id: user.id, email: user.email },
    "chat_secret_key",
    { expiresIn: "1d" }
  );

  return {
    token,
    user
  };

};

exports.sendMessage = async (data) => {
    const autoReplyEnabled =
      data?.autoReplyEnabled ??
      data?.aiFeatures?.autoReplyEnabled ??
      false;

    const autoReplyForUserId =
      data?.aiFeatures?.autoReplyForUserId ??
      data?.receiver_id;

    if (Number(data.receiver_id) === AI_BOT_USER_ID) {
      const userMessageResult = await messageDao.sendMessage({
        sender_id: data.sender_id,
        receiver_id: data.receiver_id,
        message: data.message
      });

      const conversation = await messageDao.getMessages(data.sender_id, AI_BOT_USER_ID);
      const aiContext = conversation
        .slice(-MAX_AI_CONTEXT_MESSAGES)
        .map((item) => ({
          role: Number(item.sender_id) === AI_BOT_USER_ID ? "assistant" : "user",
          content: item.message
        }));

      const aiReply = await getAIReply(data.message, aiContext);

      const aiMessageResult = await messageDao.sendMessage({
        sender_id: AI_BOT_USER_ID,
        receiver_id: data.sender_id,
        message: aiReply
      });

      return {
        isAIFlow: true,
        userMessage: {
          id: userMessageResult.insertId,
          sender_id: data.sender_id,
          receiver_id: data.receiver_id,
          message: data.message
        },
        aiMessage: {
          id: aiMessageResult.insertId,
          sender_id: AI_BOT_USER_ID,
          receiver_id: data.sender_id,
          message: aiReply
        }
      };
    }

    const result = await messageDao.sendMessage(data);

    if (
      autoReplyEnabled === true &&
      Number(data.receiver_id) !== AI_BOT_USER_ID &&
      Number(autoReplyForUserId) === Number(data.receiver_id)
    ) {
      triggerAutoReply(data.sender_id, data.receiver_id, data.message);
    }
  
    return {
      message: "Message sent",
      messageId: result.insertId
    };
  
  };

  exports.getMessages = async (senderId, receiverId) => {

    const messages = await messageDao.getMessages(senderId, receiverId);
    return messages;
  
  };

  exports.uploadProfileImage = async (userId, imagePath) => {

    const result = await userDao.updateProfileImage(userId, imagePath);

    if (!result.affectedRows) {
      throw { message: "User not found" };
    }

    return {
      message: "Profile image uploaded successfully",
      imagePath,
      avatar: imagePath
    };

  };

exports.updateAbout = async (userId, about) => {

  const result = await userDao.updateAbout(userId, about);

  if (!result.affectedRows) {
    throw { message: "User not found" };
  }

  return {
    message: "About updated successfully",
    about
  };

};

exports.deleteAccount = async (userId, is_delete) => {

  const result = await userDao.deleteAccount(userId, is_delete);

  if (!result.affectedRows) {
    throw { message: "User not found" };
  }

  return {
    message: "Account deleted successfully",
    is_delete
  };

};

exports.rewriteMessage = async (message) => {
  const rewrittenMessage = await rewriteWithAI(message);

  return {
    message: "Message rewritten successfully",
    rewrittenMessage
  };
};

exports.suggestReplies = async (message) => {
  const suggestions = await generateSuggestions(message);

  return {
    message: "Suggestions generated successfully",
    suggestions
  };
};
  
