const Message = require("../models/Message");
const Chat = require("../models/Chat");

const chatSocketHandler = (io) => {
  const chatNamespace = io.of("/chat");

  chatNamespace.use((socket, next) => {
    // In a real app, verify JWT here
    // For now, we assume the client passes their ID and Model in the handshake auth or query
    const authPayload = socket.handshake.auth && socket.handshake.auth.userId ? socket.handshake.auth : socket.handshake.query;
    const userId = authPayload.userId;
    const userModel = authPayload.userModel; // "User" or "Doctor"
    
    console.log(`[Chat Socket] Connection attempt - userId: ${userId}, userModel: ${userModel}`);

    if (!userId || !userModel) {
      console.log(`[Chat Socket] Auth error - missing userId or userModel. Payload:`, authPayload);
      return next(new Error("Authentication error"));
    }
    
    socket.userId = userId;
    socket.userModel = userModel;
    next();
  });

  chatNamespace.on("connection", (socket) => {
    console.log(`🔌 User connected to chat: ${socket.userId} (${socket.userModel})`);

    // Join a specific chat room
    socket.on("join_chat", async (chatId) => {
      await socket.join(chatId);
      const roomSize = chatNamespace.adapter.rooms.get(chatId)?.size || 0;
      console.log(`[Chat] User ${socket.userId} (${socket.userModel}) joined room ${chatId} | room size: ${roomSize}`);
    });

    // Handle incoming messages
    socket.on("send_message", async (data, callback) => {
      try {
        const { chatId, messageType, content, fileName } = data;

        // Verify chat exists
        const chat = await Chat.findById(chatId);
        if (!chat) throw new Error("Chat not found");

        // Create message in DB
        const newMessage = await Message.create({
          chatId,
          senderId: socket.userId,
          senderModel: socket.userModel,
          messageType: messageType || "text",
          content,
          fileName,
          isRead: false
        });

        // Update last message in chat
        chat.lastMessage = newMessage._id;
        await chat.save();

        // Emit a plain JSON-serializable object — NOT the raw Mongoose doc.
        // Raw docs can serialize ObjectId fields in unexpected ways across
        // different socket.io / Mongoose version combinations.
        const payload = {
          _id:         newMessage._id.toString(),
          chatId:      newMessage.chatId.toString(),
          senderId:    newMessage.senderId.toString(),
          senderModel: newMessage.senderModel,
          messageType: newMessage.messageType,
          content:     newMessage.content,
          fileName:    newMessage.fileName || null,
          isRead:      newMessage.isRead,
          createdAt:   newMessage.createdAt,
          updatedAt:   newMessage.updatedAt,
        };

        console.log(`[Chat] Broadcasting to room ${chatId}:`, payload._id, '| sender:', socket.userId);

        // Broadcast to everyone in the room EXCEPT the sender.
        socket.to(chatId).emit("receive_message", payload);

        // Acknowledge success to sender with the same plain payload
        if (callback) callback({ success: true, message: payload });
      } catch (error) {
        console.error("Chat Error:", error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    // Handle typing indicators
    socket.on("typing", ({ chatId, isTyping }) => {
      // Broadcast to everyone ELSE in the room
      socket.to(chatId).emit("user_typing", {
        userId: socket.userId,
        isTyping
      });
    });

    // Handle read receipts
    socket.on("mark_read", async ({ chatId, messageIds }) => {
      try {
        await Message.updateMany(
          { _id: { $in: messageIds } },
          { $set: { isRead: true } }
        );
        
        socket.to(chatId).emit("messages_read", { messageIds });
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    });

    socket.on("disconnect", () => {
      console.log(`🔌 User disconnected from chat: ${socket.userId}`);
    });
  });
};

module.exports = { chatSocketHandler };
