const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const { AppError } = require("../middleware/errorHandler");

const generateAccessToken = (admin) => {
  return jwt.sign(
    { id: admin._id, role: admin.role },
    process.env.JWT_ACCESS_SECRET,
  );
};

const generateRefreshToken = (admin) => {
  return jwt.sign({ id: admin._id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });
};

exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email }).select("+password");

    if (!admin || !admin.isActive) {
      return next(new AppError("Invalid email or password", 401));
    }
    console.log("email", email, password);
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return next(new AppError("Invalid email or password", 401));
    }

    const accessToken = generateAccessToken(admin);
    const refreshToken = generateRefreshToken(admin);

    console.log("Access token", accessToken, refreshToken);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    };

    res.cookie("adminAccessToken", accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 60 * 1000,
    });

    res.cookie("adminRefreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      admin: {
        id: admin._id,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    return next(new AppError("An unexpected error occurred during login", 500));
  }
};

exports.getCurrentAdmin = async (req, res, next) => {
  try {
    if (!req.admin) {
      return next(new AppError("Unauthorized", 401));
    }

    return res.status(200).json({
      success: true,
      admin: req.admin,
    });
  } catch (err) {
    return next(new AppError("Failed to fetch admin", 500));
  }
};

exports.adminLogout = async (req, res, next) => {
  try {
    res.clearCookie("adminAccessToken");
    res.clearCookie("adminRefreshToken");

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (err) {
    return next(new AppError("Logout failed", 500));
  }
};
