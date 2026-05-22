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
    socket.on("join_chat", (chatId) => {
      socket.join(chatId);
      console.log(`User ${socket.userId} joined chat ${chatId}`);
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

        // Broadcast to everyone in the room EXCEPT the sender.
        // The sender already receives the message via the callback below,
        // so broadcasting back to them would cause a duplicate message.
        socket.to(chatId).emit("receive_message", newMessage);

        // Acknowledge success to sender with the saved message
        if (callback) callback({ success: true, message: newMessage });
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
