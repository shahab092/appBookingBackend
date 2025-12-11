import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true, 
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      select: false, 
    },

    googleId: {
      type: String,
      default: null
    },

    avatar: {
      type: String, 
      default:
        "https://cdn-icons-png.flaticon.com/512/149/149071.png"
    },

    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local"
    },


    refreshToken: {
      type: String,
      select: false,
    }
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
