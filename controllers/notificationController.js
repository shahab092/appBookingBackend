const Notification = require("../models/Notification");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

// ================= GET NOTIFICATIONS =================
const getNotifications = asyncHandler(async (req, res) => {
  if (!req.user || !req.user._id) {
    throw new ApiError(401, "Unauthorized: user not found in request");
  }

  const userId = req.user._id;

  const notifications = await Notification.find({ user: userId }).sort({
    createdAt: -1,
  });

  const unreadCount = await Notification.countDocuments({
    user: userId,
    isRead: false,
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { notifications, unreadCount },
        "Notifications fetched"
      )
    );
});

// ================= MARK ONE AS READ =================
const markAsRead = asyncHandler(async (req, res) => {
  if (!req.user) throw new ApiError(401, "Unauthorized");

  const { id } = req.params;

  const notif = await Notification.findOne({
    _id: id,
    user: req.user._id,
  });

  if (!notif) throw new ApiError(404, "Notification not found");

  notif.isRead = true;
  await notif.save();

  res.json(new ApiResponse(200, notif, "Marked as read"));
});

// ================= MARK ALL AS READ =================
const markAllAsRead = asyncHandler(async (req, res) => {
  if (!req.user) throw new ApiError(401, "Unauthorized");

  await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { isRead: true }
  );

  res.json(new ApiResponse(200, null, "All marked as read"));
});

// ================= DELETE NOTIFICATION =================
const deleteNotification = asyncHandler(async (req, res) => {
  if (!req.user) throw new ApiError(401, "Unauthorized");

  const { id } = req.params;

  const notif = await Notification.findOne({
    _id: id,
    user: req.user._id,
  });

  if (!notif) throw new ApiError(404, "Notification not found");

  await notif.deleteOne();

  res.json(new ApiResponse(200, null, "Notification deleted"));
});

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
