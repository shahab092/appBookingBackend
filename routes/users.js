const express = require("express");
const router = express.Router();

const {
  createUser,
  login,
  googleLogin,
  refreshAccessToken,
  logoutUser,
} = require("../controllers/userController");

// const { verifyJWT } = require("../middlewares/auth.middleware");

// Routes
router.post("/register", createUser);
router.post("/login", login);
// router.post("/google-login", googleLogin);
// router.post("/refresh-token", refreshAccessToken);
// router.post("/logout", verifyJWT, logoutUser);

module.exports = router;
