const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      select: false,
    },

    googleId: {
      type: String,
      default: null,
    },

    avatar: {
      type: String,
      default: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
    },

    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },

    refreshToken: {
      type: String,
      select: false,
    },


    role: {
      type: String,
      enum: ["patient", "doctor", "admin"],
      default: "patient",
    },


    status: {
      type: String,
      enum: ["pending", "active", "rejected"],
      default: null,
    },

    doctorProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DoctorProfile",
      default: null,
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
