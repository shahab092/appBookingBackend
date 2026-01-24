const ApiError = require("../utils/ApiError");

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (!req.user) {
        throw new ApiError(401, "Authentication required");
    }

    if (req.user.role !== 'admin') {
        throw new ApiError(403, "Access denied. Admin privileges required.");
    }

    next();
};

module.exports = isAdmin;
