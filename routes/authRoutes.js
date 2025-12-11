const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
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
router.post('/google-login', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ message: 'Google credential is required' });
    }

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture, given_name, family_name } = payload;

    // Check if user already exists
    let user = await User.findOne({ email });

    if (user) {
      // Check if existing user is a patient
      if (user.role !== 'patient') {
        return res.status(403).json({ 
          message: 'Only patients can login with Google. Please use another login method.' 
        });
      }
      
      // Update last login for existing patient
      user.lastLogin = new Date();
      await user.save();
    } else {
      // Create new PATIENT user
      user = await User.create({
        googleId,
        email,
        name,
        firstName: given_name || name.split(' ')[0],
        lastName: family_name || name.split(' ').slice(1).join(' '),
        picture,
        role: 'patient', // Force role to be patient
        isVerified: true,
        lastLogin: new Date()
      });
    }

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        picture: user.picture,
        firstName: user.firstName,
        lastName: user.lastName
      },
      token
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(401).json({ 
      success: false,
      message: 'Invalid Google authentication' 
    });
  }
});

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