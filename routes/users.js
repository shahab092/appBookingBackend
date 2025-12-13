const express = require("express");
const router = express.Router();

const {
  register,
  login,
  googleLogin,
  refreshAccessToken,
  logoutUser,
} = require("../controllers/authController");

const { verifyJWT } = require("../middlewares/auth.middleware");

// Routes
router.post("/register", register);
router.post("/login", login);
router.post("/google-login", googleLogin);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", verifyJWT, logoutUser);

module.exports = router;
