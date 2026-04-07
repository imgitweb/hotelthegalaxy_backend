const Rider = require("../models/rider.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { generateOTP, hashOTP } = require("../utils/otp");
const { sendOTP } = require("../services/smsService");

const generatePassword = () => {
  return Math.random().toString(36).slice(-8);
};

const MAX_OTP_REQUESTS = Number(process.env.OTP_MAX_REQUESTS_PER_HOUR) || 5;
const OTP_COOLDOWN = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60) * 1000;
const OTP_EXPIRY = Number(process.env.OTP_EXPIRY_MINUTES || 5) * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

exports.registerRider = async (req, res, next) => {
  try {
    const { name, phone, vehicleNumber } = req.body;

    const existingRider = await Rider.findOne({ phone });
    if (existingRider) {
      return res.status(400).json({
        success: false,
        message: "Rider with this phone number already exists",
      });
    }

    const tempPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const rider = await Rider.create({
      name,
      phone,
      vehicleNumber,
      password: hashedPassword,
    });

    // TODO: Send SMS/WhatsApp with temp password
    // await sendSMS(phone, `Your temporary password is: ${tempPassword}`);

    res.status(201).json({
      success: true,
      message: "Rider created successfully",
      data: {
        rider: {
          _id: rider._id,
          name: rider.name,
          phone: rider.phone,
          vehicleNumber: rider.vehicleNumber,
          status: rider.status,
        },
        tempPassword, 
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.requestOtp = async (req, res, next) => {
  try {
    const { phone } = req.body;
    console.log("🏍️ Rider OTP request for phone:", phone);

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const rider = await Rider.findOne({ phone }).select(
      "+password +otp +otpExpiresAt +otpLastRequestedAt +otpRequestCount +otpRequestWindowStartedAt",
    );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found. Please register first.",
      });
    }

    if (!rider.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated",
      });
    }

    const now = Date.now();

    if (rider.otpLastRequestedAt && now - rider.otpLastRequestedAt.getTime() < OTP_COOLDOWN) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting OTP again",
      });
    }

    if (!rider.otpRequestWindowStartedAt || now - rider.otpRequestWindowStartedAt.getTime() > ONE_HOUR) {
      rider.otpRequestWindowStartedAt = new Date();
      rider.otpRequestCount = 0;
    }

    if (rider.otpRequestCount >= MAX_OTP_REQUESTS) {
      return res.status(429).json({
        success: false,
        message: "Too many OTP requests. Try again later.",
      });
    }

    const otp = generateOTP();
    const hashed = hashOTP(otp);

    const updatedRider = await Rider.findByIdAndUpdate(
      rider._id,
      {
        otp: hashed,
        otpExpiresAt: new Date(now + OTP_EXPIRY),
        otpLastRequestedAt: new Date(),
        otpRequestCount: (rider.otpRequestCount || 0) + 1,
        otpRequestWindowStartedAt: rider.otpRequestWindowStartedAt,
      },
      {
        new: true,
        runValidators: false,
      },
    );

    if (!updatedRider) {
      return res.status(500).json({
        success: false,
        message: "Failed to update OTP data",
      });
    }

    const smsResult = await sendOTP(phone, otp);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      ...(smsResult.bypass ? { otp } : {}),
    });
  } catch (error) {
    console.error("REQUEST OTP ERROR:", error);
    next(error);
  }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    console.log("🏍️ Rider OTP verification for phone:", phone);

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP are required",
      });
    }

    const rider = await Rider.findOne({ phone }).select(
      "+password +otp +otpExpiresAt +otpAttempts",
    );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    if (!rider.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated",
      });
    }

    if (!rider.otp || !rider.otpExpiresAt || rider.otpExpiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired or invalid. Request a new one.",
      });
    }

    if ((rider.otpAttempts || 0) >= 10) {
      return res.status(429).json({
        success: false,
        message: "Too many OTP attempts. Request a fresh OTP.",
      });
    }

    const hashedOtp = hashOTP(otp);
    if (hashedOtp !== rider.otp) {
      await Rider.findByIdAndUpdate(
        rider._id,
        {
          otpAttempts: (rider.otpAttempts || 0) + 1,
        },
        { runValidators: false },
      );

      return res.status(401).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    await Rider.findByIdAndUpdate(
      rider._id,
      {
        otp: undefined,
        otpExpiresAt: undefined,
        otpAttempts: 0,
        otpRequestCount: 0,
        otpLastRequestedAt: undefined,
        otpRequestWindowStartedAt: undefined,
      },
      { runValidators: false },
    );

    const token = jwt.sign(
      { riderId: rider._id, role: "rider" },
      process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" },
    );

    console.log("🏍️ Rider JWT generated with payload:", { riderId: rider._id, role: "rider" });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        rider: {
          _id: rider._id,
          name: rider.name,
          phone: rider.phone,
          vehicleNumber: rider.vehicleNumber,
          status: rider.status,
          currentTripId: rider.currentTripId,
        },
        token,
      },
    });
  } catch (error) {
    console.error("VERIFY OTP ERROR:", error);
    next(error);
  }
};

exports.loginRider = async (req, res, next) => {
  try {
    const { phone, password } = req.body;

    const rider = await Rider.findOne({ phone });
    if (!rider) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password",
      });
    }

    if (!rider.isActive) {
      return res.status(401).json({
        success: false,
        message: "Account is deactivated",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, rider.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password",
      });
    }

    const token = jwt.sign(
      { riderId: rider._id, role: "rider" },
      process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      data: {
        rider: {
          _id: rider._id,
          name: rider.name,
          phone: rider.phone,
          vehicleNumber: rider.vehicleNumber,
          status: rider.status,
          currentTripId: rider.currentTripId,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getRiderProfile = async (req, res, next) => {
  try {
    const rider = await Rider.findById(req.riderId).select("-password");

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    res.json({
      success: true,
      data: rider,
    });
  } catch (error) {
    next(error);
  }
};

exports.logoutRider = async (req, res, next) => {
  try {
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};