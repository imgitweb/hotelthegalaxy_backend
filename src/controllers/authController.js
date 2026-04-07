const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { generateOTP, hashOTP } = require("../utils/otp");
const { sendOTP } = require("../services/smsService");
const { sendAuthTemplate } = require("../utils/whatsaap/sendAuthTemplate");
const MAX_OTP_REQUESTS = Number(process.env.OTP_MAX_REQUESTS_PER_HOUR) || 5;
const OTP_COOLDOWN =
  Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60) * 1000;
const OTP_EXPIRY = Number(process.env.OTP_EXPIRY_MINUTES || 5) * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const normalizePhone = (phone) => phone.replace(/\D/g, "");

exports.sendOtp = async (req, res) => {
  try {
    const { fullName, phone, email } = req.body;
    phone = normalizePhone(phone);
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }
 
    let user = await User.findOne({ phone }).select(
      "+otpLastRequestedAt +otpRequestCount +otpRequestWindowStartedAt"
    );
if (!user) {
  return res.status(404).json({
    success: false,
    message: "User not found, please sign up",
  });
}
    const now = Date.now();

 
    if (
      user.otpLastRequestedAt &&
      now - user.otpLastRequestedAt.getTime() < OTP_COOLDOWN
    ) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting OTP again",
      });
    }
 
    if (
      !user.otpRequestWindowStartedAt ||
      now - user.otpRequestWindowStartedAt.getTime() > ONE_HOUR
    ) {
      user.otpRequestWindowStartedAt = new Date();
      user.otpRequestCount = 0;
    }

   
    if (user.otpRequestCount >= MAX_OTP_REQUESTS) {
      return res.status(429).json({
        success: false,
        message: "Too many OTP requests. Try again later.",
      });
    }
 
    const otp = generateOTP();
    const hashedOtp = hashOTP(otp);

    user.otp = hashedOtp;
    user.otpExpiresAt = new Date(now + OTP_EXPIRY);
    user.otpLastRequestedAt = new Date();
    user.otpRequestCount += 1;

    await user.save();
 
    const whatsappResponse = await sendAuthTemplate(phone, otp);

    if (!whatsappResponse.success) {
      console.error("❌ WhatsApp Send Failed:", whatsappResponse.error);

      return res.status(500).json({
        success: false,
        message: "Failed to send OTP via WhatsApp",
      });
    }

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully on WhatsApp",
    });

  } catch (error) {
    console.error("SEND OTP ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};
exports.sendSignupOtp = async (req, res) => {
  try {
    let { fullName, phone, email } = req.body;

    if (!phone || !fullName) {
      return res.status(400).json({
        success: false,
        message: "Full name and phone are required",
      });
    }

   
   phone = normalizePhone(phone);
    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists, please login",
      });
    }

    const user = new User({
      fullName,
      phone,
      email: email || null,
    });

    const now = Date.now();

    const otp = generateOTP();
    const hashedOtp = hashOTP(otp);

    user.otp = hashedOtp;
    user.otpExpiresAt = new Date(now + OTP_EXPIRY);
    user.otpLastRequestedAt = new Date();
    user.otpRequestCount = 1;

    await user.save();
    const whatsappResponse = await sendAuthTemplate(`+${phone}`, otp);

    if (!whatsappResponse.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Signup OTP sent",
    });

  } catch (error) {
    console.error("SIGNUP OTP ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Signup OTP failed",
    });
  }
};
exports.verifyOtp = async (req, res) => {
  try {
    let { phone, otp } = req.body;

    phone = normalizePhone(phone);

    if (!phone || !otp) {
      return res.status(400).json({
        success: false, 
        message: "Phone and OTP required",
      });
    }

    const user = await User.findOne({ phone }).select(
      "+otp +otpExpiresAt +otpAttempts",
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account disabled",
      });
    }

    if (!user.otp || user.otpExpiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    if (user.otpAttempts >= 10) {
      return res.status(429).json({
        success: false,
        message: "Too many invalid attempts",
      });
    }

    const hashedOtp = hashOTP(otp);

    if (hashedOtp !== user.otp) {
      user.otpAttempts += 1;
      await user.save();

      return res.status(401).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    user.isVerified = true;
    user.lastLoginAt = new Date();
    user.otp = undefined;
    user.otpExpiresAt = undefined;
    user.otpAttempts = 0;

    await user.save();

    const accessToken = jwt.sign(
      { id: user._id, phone: user.phone },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: "7d" },
    );

    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "30d" },
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("VERIFY OTP ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
};
exports.AddAddress = async (re, res) => {
  try {
  } catch (error) {
    console.error("Something went wrong!", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error !",
    });
  }
};
exports.getAddress = async (req, res) => {
  try {
  } catch (error) {
    console.error("Something went wrong!", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error !",
    });
  }
};
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, email } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { fullName, email },
      { new: true },
    );

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("UPDATE PROFILE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Profile update failed",
    });
  }
};
