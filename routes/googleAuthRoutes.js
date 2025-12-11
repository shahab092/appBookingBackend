const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');

// Generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id,
      email: user.email,
      role: user.role 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

// @route   GET /api/oauth/google
// @desc    Initiate Google OAuth
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
  })
);

// @route   GET /api/oauth/google/callback
// @desc    Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=authentication_failed`);
      }

      // Generate JWT token
      const token = generateToken(req.user);
      
      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL}/dashboard?token=${token}&user=${encodeURIComponent(JSON.stringify(req.user.getPublicProfile()))}`);
    } catch (error) {
      console.error('Google callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);
    }
  }
);

// @route   POST /api/oauth/google/token
// @desc    Verify Google token from frontend (for mobile/SPA)
router.post('/google/token', async (req, res) => {
  try {
    const { token: googleToken } = req.body;

    if (!googleToken) {
      return res.status(400).json({
        success: false,
        message: 'Google token is required'
      });
    }

    // Verify Google token (you might need to use google-auth-library)
    // For now, we'll use the passport strategy
    // This is a simplified version - in production, verify the token properly
    
    // For mobile/SPA, you would verify the Google token server-side
    // Then find/create user and return JWT
    
    res.status(200).json({
      success: false,
      message: 'This endpoint needs proper Google token verification implementation'
    });
  } catch (error) {
    console.error('Google token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/oauth/status
// @desc    Check OAuth status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    google: !!process.env.GOOGLE_CLIENT_ID,
    frontendUrl: process.env.FRONTEND_URL
  });
});

module.exports = router;