const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const JWT = require("jsonwebtoken");
const { User } = require("../models/user.model");
 const verifyJWT = asyncHandler(async (req, res, next) => {
    try {
        const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "")

        if (!token) {
            throw new ApiError(401, 'Unauthorized request')
        }
        const decodedToken = JWT.verify(token, process.env.ACCESS_TOKEN_SECRET)
        const user = await User.findById(decodedToken?._id).select("-password -refreshToken")
        if (!user) {
            throw new ApiError(401, "invaild access token")
        }
        req.user = user;
        next()
    } catch (error) {
        throw new ApiError(401, "invaild access token")
    }
}) 

module.exports = { verifyJWT }