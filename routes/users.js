const express = require("express");
const router = express.Router();

const {
  register,
  login,
  refreshToken,
  logoutUser,
} = require("../controllers/authController");

// const { verifyJWT } = require("../middlewares/auth.middleware");

// Routes
router.post("/register", register);
router.post("/login", login);
router.post("/refresh-token", refreshToken);
// router.post("/logout", verifyJWT, logoutUser);

module.exports = router;
