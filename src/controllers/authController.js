// const User = require("../models/User");
// const jwt = require("jsonwebtoken");
// const { generateOTP, hashOTP } = require("../utils/otp");
// const { sendOTP } = require("../services/smsService");

// const MAX_OTP_REQUESTS = Number(process.env.OTP_MAX_REQUESTS_PER_HOUR) || 5;

// const OTP_COOLDOWN =
//   Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60) * 1000;

// const OTP_EXPIRY = Number(process.env.OTP_EXPIRY_MINUTES || 5) * 60 * 1000;

// const ONE_HOUR = 60 * 60 * 1000;
// exports.sendOtp = async (req, res) => {
//   try {
//     const { fullName, phone, email } = req.body;

//     if (!phone) {
//       return res.status(400).json({
//         success: false,
//         message: "Phone number is required",
//       });
//     }

//     let user = await User.findOne({ phone }).select(
//       "+otpLastRequestedAt +otpRequestCount +otpRequestWindowStartedAt",
//     );

//     if (!user) {
//       if (!fullName) {
//         return res.status(400).json({
//           success: false,
//           message: "Full name required for signup",
//         });
//       }

//       user = new User({
//         fullName,
//         phone,
//         email: email || null,
//       });
//     }

//     const now = Date.now();

//     if (
//       user.otpLastRequestedAt &&
//       now - user.otpLastRequestedAt.getTime() < OTP_COOLDOWN
//     ) {
//       return res.status(429).json({
//         success: false,
//         message: "Please wait before requesting OTP again",
//       });
//     }

//     if (
//       !user.otpRequestWindowStartedAt ||
//       now - user.otpRequestWindowStartedAt.getTime() > ONE_HOUR
//     ) {
//       user.otpRequestWindowStartedAt = new Date();
//       user.otpRequestCount = 0;
//     }

//     if (user.otpRequestCount >= MAX_OTP_REQUESTS) {
//       return res.status(429).json({
//         success: false,
//         message: "Too many OTP requests. Try again later.",
//       });
//     }

//     const otp = generateOTP();
//     const hashedOtp = hashOTP(otp);

//     user.otp = hashedOtp;
//     user.otpExpiresAt = new Date(now + OTP_EXPIRY);
//     user.otpLastRequestedAt = new Date();
//     user.otpRequestCount += 1;

//     await user.save();

//     sendOTP(phone, otp).catch((err) =>

//       console.error("SMS ERROR:", err.message),
//     );

//     return res.status(200).json({
//       success: true,
//       message: "OTP sent successfully",
//     });
//   } catch (error) {
//     console.error("SEND OTP ERROR:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to send OTP",
//     });
//   }
// };
// exports.verifyOtp = async (req, res) => {
//   try {
//     const { phone, otp } = req.body;

//     if (!phone || !otp) {
//       return res.status(400).json({
//         success: false,
//         message: "Phone and OTP required",
//       });
//     }

//     const user = await User.findOne({ phone }).select(
//       "+otp +otpExpiresAt +otpAttempts",
//     );

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     if (!user.isActive) {
//       return res.status(403).json({
//         success: false,
//         message: "Account disabled",
//       });
//     }

//     if (!user.otp || user.otpExpiresAt < new Date()) {
//       return res.status(400).json({
//         success: false,
//         message: "OTP expired",
//       });
//     }

//     if (user.otpAttempts >= 5) {
//       return res.status(429).json({
//         success: false,
//         message: "Too many invalid attempts",
//       });
//     }

//     const hashedOtp = hashOTP(otp);

//     if (hashedOtp !== user.otp) {
//       user.otpAttempts += 1;
//       await user.save();

//       return res.status(401).json({
//         success: false,
//         message: "Invalid OTP",
//       });
//     }

//     user.isVerified = true;
//     user.lastLoginAt = new Date();
//     user.otp = undefined;
//     user.otpExpiresAt = undefined;
//     user.otpAttempts = 0;

//     await user.save();

//     const accessToken = jwt.sign(
//       { id: user._id, phone: user.phone },
//       process.env.JWT_ACCESS_SECRET,
//       { expiresIn: "7d" },
//     );

//     const refreshToken = jwt.sign(
//       { id: user._id },
//       process.env.JWT_REFRESH_SECRET,
//       { expiresIn: "30d" },
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Login successful",
//       token: accessToken,
//       refreshToken,
//       user: {
//         id: user._id,
//         fullName: user.fullName,
//         phone: user.phone,
//         email: user.email,
//       },
//     });
//   } catch (error) {
//     console.error("VERIFY OTP ERROR:", error);
//     return res.status(500).json({
//       success: false,
//       message: "OTP verification failed",
//     });
//   }
// };

// exports.AddAddress = async (re, res) => {
//   try {
//   } catch (error) {
//     console.error("Something went wrong!", error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error !",
//     });
//   }
// };
// exports.getAddress = async (req, res) => {
//   try {
//   } catch (error) {
//     console.error("Something went wrong!", error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error !",
//     });
//   }
// };

// exports.updateProfile = async (req, res) => {
//   try {
//     const { fullName, email } = req.body;

//     const user = await User.findByIdAndUpdate(
//       req.user.id,
//       { fullName, email },
//       { new: true },
//     );

//     res.json({
//       success: true,
//       user,
//     });
//   } catch (error) {
//     console.error("UPDATE PROFILE ERROR:", error);

//     res.status(500).json({
//       success: false,
//       message: "Profile update failed",
//     });
//   }
// };


const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { generateOTP, hashOTP } = require("../utils/otp");
const { sendOTP } = require("../services/smsService");

const MAX_OTP_REQUESTS = Number(process.env.OTP_MAX_REQUESTS_PER_HOUR) || 5;

const OTP_COOLDOWN =
  Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60) * 1000;

const OTP_EXPIRY = Number(process.env.OTP_EXPIRY_MINUTES || 5) * 60 * 1000;

const ONE_HOUR = 60 * 60 * 1000;
exports.sendOtp = async (req, res) => {
  try {
    const { fullName, phone, email } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    let user = await User.findOne({ phone }).select(
      "+otpLastRequestedAt +otpRequestCount +otpRequestWindowStartedAt",
    );

    if (!user) {
      if (!fullName) {
        return res.status(400).json({
          success: false,
          message: "Full name required for signup",
        });
      }

      user = new User({
        fullName,
        phone,
        email: email || null,
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

    sendOTP(phone, otp).catch((err) =>

      console.error("SMS ERROR:", err.message),
    );

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("SEND OTP ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

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