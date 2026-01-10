const express = require("express");
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require("../controllers/notificationController");
const auth = require("../middleware/auth"); // must be a function

// const { protect } = require("../middleware/auth"); // Middleware to get req.user

// router.use(protect); // All routes require login

router.use(auth);

router.get("/", getNotifications);
router.patch("/:id/read", markAsRead);
router.patch("/read-all", markAllAsRead);
router.delete("/:id", deleteNotification);

module.exports = router;
