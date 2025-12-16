// controllers/userController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const asyncHandler = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const ApiResponse = require('../utils/ApiResponse');


// --------------------
// Email/Password Login & Register
// --------------------

// Register new user

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar || null,
      provider: user.provider,
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

const createUser = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    role,
    address,
  } = req.body;

  // 1️⃣ Validate required fields
  if (!firstName || !lastName || !email || !password || !role) {
    throw new ApiError(
      400,
      "First name, last name, email, password and role are required"
    );
  }

  // 2️⃣ Validate role
  const allowedRoles = ["admin", "super_admin", "lab", "xray", "pharmacy"];
  if (!allowedRoles.includes(role)) {
    throw new ApiError(400, "Invalid role");
  }

  // 3️⃣ Check duplicate email
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(400, "Email already registered");
  }

  // 4️⃣ Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // 5️⃣ Base user object
  const userData = {
    firstName,
    lastName,
    email,
    phoneNumber,
    password: hashedPassword,
    role,
    address,
    provider: "local",
    emailVerified: true,
    status: "active",
  };

  // 6️⃣ Role-based profile


  // 7️⃣ Create user
  const user = await User.create(userData);

  // 8️⃣ Response
  res.status(201).json(
    new ApiResponse(
      201,
      {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
      },
      "User created successfully"
    )
  );
});


// Login user
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
    new ApiResponse(200, { accessToken }, "Login successful")
  );
});

// Get profile (protected)
exports.getUserProfile = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Not authorized' });
  res.status(200).json({ user: req.user });
};

// Update profile (protected)
exports.updateUserProfile = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Not authorized' });

  const { name, email, password } = req.body;

  try {
    const user = await User.findById(req.user._id);

    if (name) user.name = name;
    if (email) user.email = email;
    if (password) user.password = password;

    await user.save();

    res.status(200).json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleLogin = asyncHandler(async (req, res) => {
  const { tokenId } = req.body;

  if (!tokenId) {
    throw new ApiError(400, "Google token ID is required");
  }

  // 1️⃣ Verify Google token
  const ticket = await client.verifyIdToken({
    idToken: tokenId,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.email) {
    throw new ApiError(400, "Invalid Google token");
  }

  const email = payload.email;
  const googleId = payload.sub;
  const picture = payload.picture;
  const fullName = payload.name || "Google User";

  // 2️⃣ Safely split name
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] || "Google";
  const lastName = parts.slice(1).join(" ") || "User";

  // 3️⃣ Find or create user
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
      role: "patient", // ✅ NOW VALID
      status: "active",
    });
  } else {
    // Update existing user safely
    user.googleId = user.googleId || googleId;
    user.provider = "google";
    user.emailVerified = true;

    if (!user.profilePicture && picture) {
      user.profilePicture = picture;
    }

    await user.save();
  }

  // 4️⃣ Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = refreshToken;
  user.lastLogin = new Date();
  await user.save();

  // 5️⃣ Send response
  res.status(200).json(
    new ApiResponse(
      200,
      {
        accessToken,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
        },
      },
      "Google login successful"
    )
  );
});

module.exports = {
  createUser,
  login,
  googleLogin
}