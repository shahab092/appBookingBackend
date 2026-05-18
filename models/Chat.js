const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
      unique: true, // One chat room per appointment
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor", // Points to Doctor Profile
      required: true,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Optimize for fetching a user's or doctor's chat list sorted by recently updated
chatSchema.index({ patientId: 1, updatedAt: -1 });
chatSchema.index({ doctorId: 1, updatedAt: -1 });

module.exports = mongoose.model("Chat", chatSchema);

