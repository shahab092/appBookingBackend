const express = require("express");
const path = require("path");
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
    const mimeType = (file.mimetype || "").toLowerCase();
    const extension = path.extname(file.originalname || "").toLowerCase();

    const isPdf = mimeType === "application/pdf" || extension === ".pdf";
    const isImage = mimeType.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension);
    const isAudio = mimeType.startsWith("audio/") || [".mp3", ".wav", ".ogg", ".oga", ".m4a", ".aac", ".mp4", ".webm", ".flac", ".amr", ".3gp", ".3gpp"].includes(extension);

    if (isPdf || isImage || isAudio) {
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
