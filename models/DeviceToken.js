const mongoose = require("mongoose");

const DeviceTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    deviceType: {
      type: String,
      enum: ["web", "android", "ios"],
      default: "web",
    },
    browser: {
      type: String,
      trim: true,
    },
    os: {
      type: String,
      trim: true,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Optimize lookups and updates
DeviceTokenSchema.index({ user: 1 });
DeviceTokenSchema.index({ token: 1 });

module.exports = mongoose.model("DeviceToken", DeviceTokenSchema);
