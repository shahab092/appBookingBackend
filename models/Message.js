const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    // We use dynamic referencing because sender can be a Patient (User) or Doctor
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "senderModel",
    },
    senderModel: {
      type: String,
      required: true,
      enum: ["User", "Doctor"], // User = Patient, Doctor = Doctor Profile
    },
    messageType: {
      type: String,
      enum: ["text", "image", "document", "voice_note"],
      default: "text",
    },
    content: {
      type: String,
      required: true, // Holds text, or the URL for image/doc/voice
    },
    fileName: {
      type: String, // Useful for displaying document names
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Optimize for fetching a chat's message history chronologically
messageSchema.index({ chatId: 1, createdAt: 1 });
// Optimize for getting unread message counts
messageSchema.index({ chatId: 1, isRead: 1 });

module.exports = mongoose.model("Message", messageSchema);
