const jwt = require("jsonwebtoken");
const { AppError } = require("./errorHandler");

const adminAuth = (req, res, next) => {
  try {
    const token = req.cookies.adminAccessToken;
    console.log("$$$ token",token)
    if (!token) {
      return next(new AppError("Not authorized. Please login.", 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    console.log("Decode", decoded)
    if (!decoded?.role) {
      return next(new AppError("Invalid access token", 401));
    }

    if (!["admin", "superadmin"].includes(decoded.role)) {
      return next(
        new AppError("Access denied. Admin privileges required", 403),
      );
    }

    req.admin = {
      id: decoded.id,
      role: decoded.role,
    };

    next();
  } catch (err) {
    return next(new AppError("Invalid or expired access token", 401));
  }
};

module.exports = adminAuth;
