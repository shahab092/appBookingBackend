const ApiError = require("../utils/ApiError");

const authorizeRoles =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized request");
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ApiError(403, "You are not allowed to perform this action");
    }

    next();
  };

module.exports = authorizeRoles;
