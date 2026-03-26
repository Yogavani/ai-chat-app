const userService = require("../services/userService");
const fs = require("fs");
const path = require("path");

exports.getUsers = async (request, reply) => {
  try {
    const users = await userService.getUsers();
    return users;
  } catch (error) {
    reply.code(500).send(error);
  }
};

exports.registerUser = async (request, reply) => {
    try {
      const user = await userService.registerUser(request.body);
      return user;
    } catch (error) {
      reply.code(500).send(error);
    }
  };

  exports.loginUser = async (request, reply) => {

    console.log("LOGIN HIT");
    console.log("BODY:", request.body);
  
    try {
  
      const result = await userService.loginUser(request.body);
  
      console.log("SERVICE RESULT:", result);
  
      reply.send(result);
  
    } catch (error) {
  
      console.log("LOGIN ERROR:", error);
  
      reply.code(400).send(error);
  
    }
  };

  exports.sendMessage = async (req, reply) => {
    try {
      const data = req.body;
      console.log("sendMessagesendMessage", data);
  
      const result = await userService.sendMessage(data);
  
      const newMessage = {
        id: result.insertId || result.messageId,
        sender_id: data.sender_id,
        receiver_id: data.receiver_id,
        message: data.message
      };
      const room = String(data.receiver_id);
      const members = req.server.io.sockets.adapter.rooms.get(room);
      console.log("room members", room, members ? [...members] : []);
      console.log("emit io namespace:", req.server.io.of("/").name);
      
      if (req.server && req.server.io && data.receiver_id) {
        console.log("EMITTING MESSAGE TO ROOM:", data.receiver_id);
        req.server.io.to(String(data.receiver_id)).emit("new-message", newMessage);
        req.server.io.to(String(data.sender_id)).emit("new-message", newMessage);
      }
  
      return newMessage;
  
    } catch (error) {
      reply.code(500).send(error);
    }
  };

exports.getMessages = async (req, reply) => {

    try {
  
      const { senderId, receiverId } = req.params;
      const messages = await userService.getMessages(senderId, receiverId);
      return messages;
    } catch (error) {
      reply.code(500).send(error);
  
    }
  
  };

exports.uploadProfileImage = async (request, reply) => {
  try {
    const { userId } = request.params;
    const { image } = request.body || {};

    if (!image || typeof image !== "string") {
      return reply.code(400).send({
        message: "Image is required in base64 data URL format"
      });
    }

    const matches = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!matches) {
      return reply.code(400).send({
        message: "Invalid image format. Use data:image/<type>;base64,<data>"
      });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const extension = mimeType.split("/")[1] || "png";

    const uploadsDir = path.join(process.cwd(), "uploads", "profile-images");
    fs.mkdirSync(uploadsDir, { recursive: true });

    const fileName = `user-${userId}-${Date.now()}.${extension}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, base64Data, "base64");

    const imagePath = `/uploads/profile-images/${fileName}`;
    const result = await userService.uploadProfileImage(userId, imagePath);

    return {
      ...result,
      imageUrl: imagePath
    };
  } catch (error) {
    const statusCode = error && error.message === "User not found" ? 404 : 500;
    reply.code(statusCode).send(error);
  }
};
