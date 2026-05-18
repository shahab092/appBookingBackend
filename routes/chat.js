const express = require("express");
const router = express.Router();
const multer = require("multer");
const authenticate = require("../middleware/auth");
const {
  initChat,
  getChats,
  getMessages,
  uploadMedia,
} = require("../controllers/chatController");

// Multer configuration for chat media (Docs, Images, Voice Notes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit for media/voice
  },
  fileFilter: (req, file, cb) => {
    // Allow images, pdfs, and audio files
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/jpg",
      "audio/mpeg", // mp3
      "audio/webm", // webm (browser recorded)
      "audio/wav",
      "audio/ogg"
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDFs, Images, and Audio files are allowed."), false);
    }
  },
});

router.use(authenticate);

// @route   POST /api/chat/init
router.post("/init", initChat);

// @route   GET /api/chat
router.get("/", getChats);

// @route   GET /api/chat/:chatId/messages
router.get("/:chatId/messages", getMessages);

// @route   POST /api/chat/upload
router.post(
  "/upload",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, error: err.message });
      }
      next();
    });
  },
  uploadMedia
);

module.exports = router;
