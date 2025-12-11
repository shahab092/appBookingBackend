import express, { Router } from "express";
import { register, login, googleLogin, refreshAccessToken, logoutUser } from "../controllers/authController.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(register);
router.route('/logout').post(verifyJWT, logoutUser)
router.route('/login').post(login)
router.route("/refresh-token").post(refreshAccessToken);
router.route("/google-login").post(googleLogin);

export default router;
