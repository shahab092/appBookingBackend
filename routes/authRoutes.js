const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { googleLogin } = require('../controllers/authController');
const User = require('../models/User');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// Middleware to check if user is patient
const isPatient = (req, res, next) => {
  if (req.user && req.user.role === 'patient') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Patients only.' });
  }
};

// Middleware to verify JWT
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      next();
    } catch (error) {
      res.status(401).json({ message: 'Not authorized' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

// 1. Google Login - ONLY FOR PATIENTS
router.route("/google-login").post(googleLogin);

// 2. Get patient profile (protected)
router.get('/profile', protect, isPatient, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-__v -googleId')
      .lean();

    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// 3. Update patient profile (protected)
router.put('/profile', protect, isPatient, async (req, res) => {
  try {
    const { phoneNumber, dateOfBirth, address, emergencyContact } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        phoneNumber,
        dateOfBirth,
        address,
        emergencyContact
      },
      { new: true }
    ).select('-__v -googleId');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Update failed' 
    });
  }
});

// 4. Check auth status
router.get('/check-auth', protect, isPatient, (req, res) => {
  res.json({
    success: true,
    isAuthenticated: true,
    user: req.user
  });
});

module.exports = router;