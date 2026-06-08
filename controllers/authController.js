// src/controllers/auth.controller.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const Otp = require("../models/Otp");
const Patient = require("../models/Patient");
const Doctor = require("../models/Docters");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require('../utils/ApiResponse');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
};

const getRefreshTokenFromRequest = (req) => {
  return (
    req.cookies?.refreshToken ||
    req.body?.refreshToken ||
    req.header("x-refresh-token")
  );
};

// Builds the user object returned in API responses.
// doctorProfileId is the Doctor model _id — different from user._id (User model).
// Patients use it to route video calls to the correct doctor socket.
const buildUserResponse = (user, doctorProfileId = null, name = getTokenName(user)) => ({
  _id: user._id,
  whatsappnumber: user.whatsappnumber,
  name,
  role: user.role,
  isVerified: user.isVerified,
  status: user.status,
  doctorStatus: user._doc?.doctorStatus,
  doctorProfileId: doctorProfileId || null,
});

// ── Token helpers ────────────────────────────────────────────────────────────

const getTokenName = (user, doctorRecord = null) => {
  if (user.role === "doctor") return doctorRecord?.name ;
  if (user.role === "patient") return "Patient";
  return user.role
};

const generateAccessToken = (user, name) => {
  return jwt.sign(
    {
      id: user._id,
      whatsappnumber: user.whatsappnumber,
      role: user.role,
      name,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d" }
  );
};

// ── Register ─────────────────────────────────────────────────────────────────

const register = asyncHandler(async (req, res) => {
  const { whatsappnumber, password, role } = req.body;

  if (!whatsappnumber || !password) throw new ApiError(400, "WhatsApp number and password are required");

  let user = await User.findOne({ whatsappnumber });

  if (user) {
    if (user.isVerified) {
      throw new ApiError(400, "User already exists and is verified");
    }
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

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

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

// ── Verify OTP ───────────────────────────────────────────────────────────────

const verifyOtp = asyncHandler(async (req, res) => {
  const { userId, otp } = req.body;

  if (!userId || !otp) throw new ApiError(400, "User ID and OTP are required");

  const otpRecord = await Otp.findOne({ userId, otp });

  if (!otpRecord) {
    throw new ApiError(400, "Invalid or expired OTP");
  }

  if (otpRecord.expiresAt < new Date()) {
    await Otp.deleteOne({ _id: otpRecord._id });
    throw new ApiError(400, "OTP has expired");
  }

  const user = await User.findById(userId).select("+password");
  if (!user) throw new ApiError(404, "User not found");

  user.isVerified = true;
  await user.save();

  if (user.role === 'patient') {
    const existingPatient = await Patient.findOne({ userId: user._id });
    if (!existingPatient) {
      await Patient.create({
        userId: user._id,
        whatsappnumber: user.whatsappnumber,
        password: user.password
      });
    }
  }

  await Otp.deleteOne({ _id: otpRecord._id });

  res.status(200).json(
    new ApiResponse(200, {}, "OTP verified successfully. User is now verified.")
  );
});

// ── Login ─────────────────────────────────────────────────────────────────────

const login = asyncHandler(async (req, res) => {
  console.log('Login request body:', req.body);
  const { whatsappnumber, password } = req.body;
  if (!whatsappnumber || !password) throw new ApiError(400, "WhatsApp number and password are required");

  const user = await User.findOne({ whatsappnumber }).select("+password");
  if (!user) throw new ApiError(401, "Invalid credentials");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new ApiError(401, "Invalid credentials");

  if (!user.isVerified) {
    throw new ApiError(401, "Account not verified. Please verify your OTP first.");
  }

  // For doctors: fetch the Doctor profile record to get doctorProfileId.
  // This is the Doctor model _id — patients use it to route video calls.
  // It is different from user._id (User model _id).
  let doctorProfileId = null;
  let doctorRecord = null;
  if (user.role === 'doctor') {
    doctorRecord = await Doctor.findOne({ userId: user._id });
    if (doctorRecord) {
      user._doc.doctorStatus = doctorRecord.status;
      doctorProfileId = doctorRecord._id.toString();
    }
  }

  const accessToken = generateAccessToken(user, getTokenName(user, doctorRecord));
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = refreshToken;
  await user.save();

  const userName = getTokenName(user, doctorRecord);
  const loggedInUser = buildUserResponse(user, doctorProfileId, userName);

  res.status(200)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(200, { user: loggedInUser, accessToken, refreshToken }, "Login successful")
    );
});

// ── Google Login (disabled) ───────────────────────────────────────────────────

const googleLogin = asyncHandler(async (req, res) => {
  throw new ApiError(400, "Google login not supported in this version");
});

// ── Refresh Access Token ──────────────────────────────────────────────────────

const refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = getRefreshTokenFromRequest(req);
  if (!refreshToken) throw new ApiError(401, "Refresh token missing");

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    throw new ApiError(401, "Invalid refresh token");
  }

  const user = await User.findById(decoded.id).select("+refreshToken");
  if (!user || user.refreshToken !== refreshToken) throw new ApiError(401, "Invalid refresh token");
  if (!user.isVerified) throw new ApiError(401, "User is not verified");

  const doctorRecord = user.role === "doctor"
    ? await Doctor.findOne({ userId: user._id })
    : null;
  const userName = getTokenName(user, doctorRecord);

  const newAccessToken = generateAccessToken(user, userName);
  const newRefreshToken = generateRefreshToken(user);

  user.refreshToken = newRefreshToken;
  await user.save();

  res.status(200)
    .cookie("refreshToken", newRefreshToken, cookieOptions)
    .json(
      new ApiResponse(200, {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: buildUserResponse(user, null, userName),
      }, "Access token refreshed successfully")
    );
});

// ── Logout ────────────────────────────────────────────────────────────────────

const logoutUser = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, "User not authenticated");

  await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1 } });

  res.status(200)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

module.exports = {
  register,
  verifyOtp,
  login,
  googleLogin,
  refreshAccessToken,
  logoutUser,
};
