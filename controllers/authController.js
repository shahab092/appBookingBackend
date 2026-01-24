// src/controllers/auth.controller.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const Otp = require("../models/Otp");
const Patient = require("../models/Patient");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require('../utils/ApiResponse');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate Access Token (short-lived)
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      whatsappnumber: user.whatsappnumber,
      role: user.role,
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
  const { whatsappnumber, password, role } = req.body;

  if (!whatsappnumber || !password) throw new ApiError(400, "WhatsApp number and password are required");

  let user = await User.findOne({ whatsappnumber });

  if (user) {
    if (user.isVerified) {
      throw new ApiError(400, "User already exists and is verified");
    }

    // If user exists but is not verified, we'll update the password and resend OTP
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.role = role || user.role;
    await user.save();
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    user = await User.create({
      whatsappnumber,
      password: hashedPassword,
      role: role
    });
  }

  // Generate 6-digit OTP
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Handle OTP record (upsert)
  await Otp.findOneAndUpdate(
    { userId: user._id },
    { otp: otpCode, expiresAt },
    { upsert: true, new: true }
  );

  const responseData = {
    userId: user._id,
    whatsappnumber: user.whatsappnumber,
    role: user.role,
    otp: otpCode,
    expiresAt: expiresAt
  };

  res.status(user.isNew ? 201 : 200).json(
    new ApiResponse(201, responseData, user.isNew ? "User registered successfully. Please verify OTP." : "New OTP sent. Please verify.")
  );
});

// Verify OTP
const verifyOtp = asyncHandler(async (req, res) => {
  const { userId, otp } = req.body;

  if (!userId || !otp) throw new ApiError(400, "User ID and OTP are required");

  const otpRecord = await Otp.findOne({ userId, otp });

  if (!otpRecord) {
    throw new ApiError(400, "Invalid or expired OTP");
  }

  // Check expiration (though TTL should handle it, explicit check is safer)
  if (otpRecord.expiresAt < new Date()) {
    await Otp.deleteOne({ _id: otpRecord._id });
    throw new ApiError(400, "OTP has expired");
  }

  // Mark user as verified
  const user = await User.findById(userId).select("+password");
  if (!user) throw new ApiError(404, "User not found");

  user.isVerified = true;
  await user.save();

  // Create Patient profile if role is patient
  if (user.role === 'patient') {
    const existingPatient = await Patient.findOne({ userId: user._id });
    if (!existingPatient) {
      await Patient.create({
        userId: user._id,
        whatsappnumber: user.whatsappnumber,
        password: user.password // As requested by user to have password in profile
      });
    }
  }

  // Delete OTP record after successful verification
  await Otp.deleteOne({ _id: otpRecord._id });

  res.status(200).json(
    new ApiResponse(200, {}, "OTP verified successfully. User is now verified.")
  );
});

// Login User
const login = asyncHandler(async (req, res) => {
  const { whatsappnumber, password } = req.body;
  if (!whatsappnumber || !password) throw new ApiError(400, "WhatsApp number and password are required");

  const user = await User.findOne({ whatsappnumber }).select("+password");
  if (!user) throw new ApiError(401, "Invalid credentials");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new ApiError(401, "Invalid credentials");

  // Check if user is verified
  if (!user.isVerified) {
    throw new ApiError(401, "Account not verified. Please verify your OTP first.");
  }

  // If user is a doctor, we might want to check their status in the Docters collection
  if (user.role === 'doctor') {
    const Doctor = require('../models/Docters');
    const doctorRecord = await Doctor.findOne({ userId: user._id });

    if (doctorRecord) {
      user._doc.doctorStatus = doctorRecord.status;
    }
  }

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Save refresh token to user (this updates the document, but we'll clean the response object)
  user.refreshToken = refreshToken;
  await user.save();

  // Create a clean user object for the response
  const loggedInUser = {
    _id: user._id,
    whatsappnumber: user.whatsappnumber,
    role: user.role,
    isVerified: user.isVerified,
    status: user.status,
    doctorStatus: user._doc.doctorStatus, // Include doctor status if available
  };

  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  };

  res.status(200)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(200, { user: loggedInUser, accessToken }, "Login successful")
    );
});

// Google Login REMOVED/COMMENTED OUT
const googleLogin = asyncHandler(async (req, res) => {
  throw new ApiError(400, "Google login not supported in this version");
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
  verifyOtp,
  login, googleLogin,
  refreshAccessToken,
  logoutUser,
};