const Notification = require("../models/Notification");

const notificationSocketHandler = (io) => {
  io.on("connection", (socket) => {
    console.log("User connected to notifications:", socket.id);

    // Register user to their personal room
    socket.on("identify", (userId) => {
      if (!userId) return;
      socket.userId = userId;
      socket.join(userId.toString()); // room = userId
      console.log(`Notification user registered: ${userId}`);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected from notifications:", socket.id);
    });
  });
};

// Function to send notification to a specific user
const sendNotification = async (io, userId, message, type = "info") => {
  const notification = await Notification.create({
    user: userId,
    message,
    type,
  });

  io.to(userId).emit("new-notification", notification);
};

module.exports = { notificationSocketHandler, sendNotification };
