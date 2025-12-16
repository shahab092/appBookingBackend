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
    new ApiResponse(200, {  accessToken }, "Login successful")
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


module.exports = {
  createUser,
  login,
}