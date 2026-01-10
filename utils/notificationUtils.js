const Notification = require("../models/Notification");

/**
 * Creates a notification in the database and emits it via socket.io
 * @param {object} io - Socket.io instance
 * @param {string} userId - ID of the user to receive the notification
 * @param {object} data - Notification data { title, message, type, link }
 */
const createNotification = async (
  io,
  userId,
  { title, message, type = "info", link = "" }
) => {
  try {
    const notification = await Notification.create({
      user: userId,
      title,
      message,
      type,
      link,
    });

    if (io) {
      io.to(userId.toString()).emit("new-notification", notification);
    }

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

module.exports = { createNotification };
