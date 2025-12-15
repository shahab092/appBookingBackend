// src/controllers/auth.controller.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const ApiResponse = require('../utils/ApiResponse');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate Access Token (short-lived)
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar || null,
      provider: user.provider,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m" }
  );
};

// Generate Refresh Token (long-lived)
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d" }
  );
};

// Register User
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) throw new ApiError(400, "All fields are required");

  const existingUser = await User.findOne({ email });
  if (existingUser) throw new ApiError(400, "User already exists");

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    provider: "local",
  });

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = refreshToken;
  await user.save();

  res.status(201).json(
    new ApiResponse(201, { user, accessToken }, "User registered successfully")
  );
});

// Login User
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, "Email and password are required");

  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new ApiError(401, "Invalid credentials");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new ApiError(401, "Invalid credentials");

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = refreshToken;
  await user.save();

  res.status(200).json(
    new ApiResponse(200, { user, accessToken }, "Login successful")
  );
});

// Google Login
const googleLogin = asyncHandler(async (req, res) => {
  const { tokenId } = req.body;
  if (!tokenId) throw new ApiError(400, "Google token ID is required");

  const ticket = await client.verifyIdToken({
    idToken: tokenId,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  console.log("GOOGLE PAYLOAD:", payload);

  const email = payload?.email;
  const googleId = payload?.sub;
  const picture = payload?.picture;
  const fullName = payload?.name;

  if (!email) {
    throw new ApiError(400, "Google account has no email");
  }

  // ✅ FORCE SAFE VALUES
  let firstName = "Google";
  let lastName = "User";

  if (typeof fullName === "string" && fullName.trim()) {
    const parts = fullName.trim().split(/\s+/);
    firstName = parts[0] || "Google";
    lastName = parts.slice(1).join(" ") || "User";
  }

  console.log("FINAL NAME VALUES:", { firstName, lastName });

  let user = await User.findOne({ email }).select("+refreshToken");

  if (!user) {
    user = await User.create({
      email,
      firstName,
      lastName,
      googleId,
      provider: "google",
      profilePicture: picture,
      emailVerified: true,
      role: "patient",
    });
  } else {
    user.googleId = user.googleId || googleId;
    user.provider = "google";
    user.emailVerified = true;
    if (!user.profilePicture && picture) {
      user.profilePicture = picture;
    }
    await user.save();
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = refreshToken;
  user.lastLogin = new Date();
  await user.save();

  res.status(200).json(
    new ApiResponse(200, { user, accessToken }, "Google login successful")
  );
});



// Refresh Access Token
const refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) throw new ApiError(401, "Refresh token missing");

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    throw new ApiError(401, "Invalid refresh token");
  }

  const user = await User.findById(decoded.id);
  if (!user || user.refreshToken !== refreshToken) throw new ApiError(401, "Invalid refresh token");

  const newAccessToken = generateAccessToken(user);
  res.status(200).json(
    new ApiResponse(200, { accessToken: newAccessToken, user }, "Access token refreshed successfully")
  );
});

// Logout User
const logoutUser = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, "User not authenticated");

  await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1 } });

  res.status(200)
    .clearCookie("refreshToken", { httpOnly: true, secure: true, sameSite: "lax" })
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

module.exports = {
  register,
  login, googleLogin,
  refreshAccessToken,
  logoutUser,
};