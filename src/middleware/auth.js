const jwt = require("jsonwebtoken");
const { AppError } = require("./errorHandler");
const Rider = require("../models/rider.model");

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(new AppError("Authentication required. Token missing.", 401));
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || "your-secret-key");

    console.log("🔐 Auth middleware - decoded token:", decoded);
    console.log("🔐 Request URL:", req.originalUrl);

    if (decoded.riderId) {
      req.riderId = decoded.riderId.toString();
      req.userRole = "rider";
      console.log("🏍️ Rider authenticated:", req.riderId);
    } else if (decoded.id) {
      if (req.originalUrl.includes('/auth/rider/') || req.originalUrl.includes('/rider/')) {
        try {
          const rider = await Rider.findOne({ phone: decoded.phone });
          if (rider) {
            req.riderId = rider._id.toString();
            req.userRole = "rider";
            console.log("🏍️ User token used for rider auth - rider found:", req.riderId);
          } else {
            console.log("❌ User token used for rider endpoint but no rider found");
            return next(new AppError("Invalid authentication for rider endpoint.", 401));
          }
        } catch (dbError) {
          console.log("❌ Database error checking rider:", dbError.message);
          return next(new AppError("Authentication error.", 500));
        }
      } else {
        req.userId = decoded.id.toString();
        req.userRole = decoded.role || "user";
        console.log("👤 User authenticated:", req.userId);
      }
    } else {
      console.log("❌ Invalid token payload - no riderId or id:", decoded);
      return next(new AppError("Invalid token payload.", 401));
    }

    next();
  } catch (err) {
    console.log("❌ Auth middleware error:", err.message);
    return next(new AppError("Invalid or expired authentication token.", 401));
  }
};

module.exports = auth;
