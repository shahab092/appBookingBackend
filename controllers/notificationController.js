const Notification = require("../models/Notification");
const DeviceToken = require("../models/DeviceToken");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { sendNotificationToUser } = require("../utils/pushNotificationService");


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

// ================= REGISTER DEVICE TOKEN =================
const registerDeviceToken = asyncHandler(async (req, res) => {
  if (!req.user || !req.user._id) {
    throw new ApiError(401, "Unauthorized: user not found in request");
  }

  const { token, deviceType, browser, os } = req.body;

  if (!token) {
    throw new ApiError(400, "Token is required");
  }

  const userId = req.user._id;

  // Clean up any stale associations where this token belongs to other users
  await DeviceToken.deleteMany({ token, user: { $ne: userId } });

  // Register or update the token for the current user
  const deviceToken = await DeviceToken.findOneAndUpdate(
    { token, user: userId },
    {
      deviceType: deviceType || "web",
      browser: browser || "unknown",
      os: os || "unknown",
      lastActiveAt: new Date(),
    },
    { new: true, upsert: true }
  );

  res.status(200).json(
    new ApiResponse(
      200,
      deviceToken,
      "Device token registered successfully"
    )
  );
});

// ================= UNREGISTER DEVICE TOKEN =================
const unregisterDeviceToken = asyncHandler(async (req, res) => {
  if (!req.user || !req.user._id) {
    throw new ApiError(401, "Unauthorized");
  }

  const { token } = req.body;

  if (!token) {
    throw new ApiError(400, "Token is required");
  }

  await DeviceToken.deleteOne({ token, user: req.user._id });

  res.status(200).json(
    new ApiResponse(
      200,
      null,
      "Device token unregistered successfully"
    )
  );
});

// ================= SEND TEST NOTIFICATION =================
const sendTestNotification = asyncHandler(async (req, res) => {
  if (!req.user || !req.user._id) {
    throw new ApiError(401, "Unauthorized");
  }

  const { title, body, type, link } = req.body;
  const targetUserId = req.body.userId || req.user._id;

  const result = await sendNotificationToUser(targetUserId, {
    title: title || "Test Notification",
    body: body || "This is a test notification from ApiDog/Postman!",
    type: type || "info",
    link: link || "/dashboard",
  });

  res.status(200).json(
    new ApiResponse(
      200,
      result,
      "Test notification processed successfully"
    )
  );
});

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  registerDeviceToken,
  unregisterDeviceToken,
  sendTestNotification,
};

