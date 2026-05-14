const asyncHandler = require("../utils/asyncHandler");
const JWT = require("jsonwebtoken");
const User = require("../models/User");

const verifyOptionalJWT = asyncHandler(async (req, res, next) => {
    const token =
        req.cookies?.accessToken ||
        req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
        return next();
    }

    try {
        const decodedToken = JWT.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await User.findById(decodedToken?.id).select("-password -refreshToken");

        if (user) {
            req.user = user;
        }
    } catch (error) {
        // Silently fail if token is invalid - it's optional
        console.log("Optional JWT validation failed:", error.message);
    }

    next();
});

module.exports = verifyOptionalJWT;
