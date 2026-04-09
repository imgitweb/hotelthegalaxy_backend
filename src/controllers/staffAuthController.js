const Staff = require("../models/staffModel");
const jwt = require("jsonwebtoken");

const { generateOTP, hashOTP } = require("../utils/otp");
const { normalizePhone } = require("../utils/normalizePhone");
const { sendAuthTemplate } = require("../utils/whatsaap/sendAuthTemplate");

// 🔐 CONFIG
const MAX_OTP_REQUESTS = Number(process.env.OTP_MAX_REQUESTS_PER_HOUR) || 5;
const OTP_COOLDOWN =
  Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60) * 1000;
const OTP_EXPIRY =
  Number(process.env.OTP_EXPIRY_MINUTES || 5) * 60 * 1000;

const ONE_HOUR = 60 * 60 * 1000;

// 🔥 Structured Logger Helper
const log = (level, message, meta = {}) => {
  const logData = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  if (level === "error") console.error("🔥", logData);
  else if (level === "warn") console.warn("⚠️", logData);
  else console.log("ℹ️", logData);
};

/**
 * 📲 SEND OTP
 */
exports.sendOtp = async (req, res) => {
  const start = Date.now();

  try {
    log("info", "SEND OTP REQUEST", {
      body: req.body,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const { phone } = req.body;

    if (!phone) {
      log("warn", "Phone missing");
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const normalizedPhone = normalizePhone(phone);

    log("info", "Phone normalized", {
      input: phone,
      normalized: normalizedPhone,
    });

    const staff = await Staff.findOne({ phone: normalizedPhone }).select(
      "+otpLastRequestedAt +otpRequestCount +otpRequestWindowStartedAt"
    );

    if (!staff) {
      log("warn", "Staff not found", { phone: normalizedPhone });
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    const now = Date.now();

    // 🔁 Reset window
    if (
      !staff.otpRequestWindowStartedAt ||
      now - staff.otpRequestWindowStartedAt.getTime() > ONE_HOUR
    ) {
      log("info", "Resetting OTP window");
      staff.otpRequestWindowStartedAt = new Date();
      staff.otpRequestCount = 0;
    }

    // 🚫 Rate limit
    if (staff.otpRequestCount >= MAX_OTP_REQUESTS) {
      log("warn", "OTP limit exceeded", {
        phone: normalizedPhone,
        count: staff.otpRequestCount,
      });

      // return res.status(429).json({
      //   success: false,
      //   message: "Too many OTP requests. Try later.",
      // });
    }

    // ⏱ Cooldown
    // if (
    //   staff.otpLastRequestedAt &&
    //   now - staff.otpLastRequestedAt.getTime() < OTP_COOLDOWN
    // ) {
    //   log("warn", "OTP cooldown active", {
    //     phone: normalizedPhone,
    //   });

    //   return res.status(429).json({
    //     success: false,
    //     message: "Wait before requesting OTP again",
    //   });
    // }

    const otp = generateOTP();
    const hashedOtp = hashOTP(otp);

    log("info", "OTP generated");

    staff.otp = hashedOtp;
    staff.otpExpiresAt = new Date(now + OTP_EXPIRY);
    staff.otpLastRequestedAt = new Date();
    staff.otpRequestCount += 1;
    staff.otpAttempts = 0;

    await staff.save();

    log("info", "OTP saved", {
      expiresAt: staff.otpExpiresAt,
    });

    const whatsappResponse = await sendAuthTemplate(
      "+" + normalizedPhone,
      otp
    );

    if (!whatsappResponse.success) {
      log("error", "WhatsApp send failed", whatsappResponse);

      return res.status(500).json({
        success: false,
        message: "Failed to send OTP",
      });
    }

    log("info", "OTP sent successfully", {
      duration: Date.now() - start + "ms",
    });

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    log("error", "SEND OTP ERROR", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};



// 1. VERIFY OTP & LOGIN
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const staff = await Staff.findOne({ phone }).select("+otp +otpExpiresAt");

    if (!staff || hashOTP(otp) !== staff.otp || staff.otpExpiresAt < new Date()) {
      return res.status(401).json({ success: false, message: "Invalid or expired OTP" });
    }

    // Generate Tokens
    const accessToken = jwt.sign({ id: staff._id, role: 'staff' }, process.env.JWT_ACCESS_SECRET, { expiresIn: "7d" });
    const refreshToken = jwt.sign({ id: staff._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: "30d" });

    res.status(200).json({
      success: true,
      token: accessToken,
      refreshToken,
      staff: {
        id: staff._id,
        name: staff.name,
        photo: staff.photo || null,
        isFirstLogin: staff.isFirstLogin
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Login failed" });
  }
};

// 2. COMPLETE PROFILE (Upload first photo)
exports.completeProfile = async (req, res) => {
  try {
    const staffId = req.user.id;
    if (!req.file) return res.status(400).json({ message: "Photo is required" });

    const staff = await Staff.findByIdAndUpdate(
      staffId,
      { photo: req.file.filename, isFirstLogin: false },
      { returnDocument: 'after' }
    );

    if (!staff) return res.status(404).json({ message: "Staff not found" });

    res.status(200).json({ success: true, message: "Profile updated", photoUrl: staff.photo });
  } catch (error) {
    res.status(500).json({ message: "Upload failed" });
  }
};

// 3. VERIFY FACE (Matching live photo with profile)
exports.verifyFace = async (req, res) => {
  try {
    const staffId = req.user.id;
    const staff = await Staff.findById(staffId);

    if (!staff || !staff.photo) return res.status(404).json({ message: "Profile photo missing" });

    // Yahan Face API logic aayega (Filhaal auto-pass for testing)
    const isMatch = true; 

    if (!isMatch) return res.status(400).json({ message: "Face match failed" });

    res.status(200).json({ success: true, message: "Face Verified" });
  } catch (error) {
    res.status(500).json({ message: "Verification error" });
  }
};

// /**
//  * 🔐 VERIFY OTP
//  */
// exports.verifyOtp = async (req, res) => {
//   const start = Date.now();

//   try {
//     log("info", "VERIFY OTP REQUEST", {
//       body: req.body,
//       ip: req.ip,
//     });

//     const { phone, otp } = req.body;

//     if (!phone || !otp) {
//       log("warn", "Missing phone/otp");
//       return res.status(400).json({
//         success: false,
//         message: "Phone and OTP required",
//       });
//     }

//     const normalizedPhone = normalizePhone(phone);

//     log("info", "Phone normalized", {
//       input: phone,
//       normalized: normalizedPhone,
//     });

//     const staff = await Staff.findOne({
//       phone: normalizedPhone,
//     }).select("+otp +otpExpiresAt +otpAttempts");

//     if (!staff) {
//       log("error", "Staff not found during verify", {
//         phone: normalizedPhone,
//       });

//       return res.status(404).json({
//         success: false,
//         message: "Staff not found",
//       });
//     }

//     if (!staff.isActive) {
//       log("warn", "Inactive account attempt", {
//         userId: staff._id,
//       });

//       return res.status(403).json({
//         success: false,
//         message: "Account disabled",
//       });
//     }

//     if (!staff.otp || staff.otpExpiresAt < new Date()) {
//       log("warn", "OTP expired", {
//         userId: staff._id,
//       });

//       return res.status(400).json({
//         success: false,
//         message: "OTP expired",
//       });
//     }

//     if (staff.otpAttempts >= 10) {
//       log("error", "Too many attempts", {
//         userId: staff._id,
//       });

//       return res.status(429).json({
//         success: false,
//         message: "Too many attempts",
//       });
//     }

//     const hashedOtp = hashOTP(otp);

//     if (hashedOtp !== staff.otp) {
//       staff.otpAttempts += 1;
//       await staff.save();

//       log("warn", "Invalid OTP", {
//         userId: staff._id,
//         attempts: staff.otpAttempts,
//       });

//       return res.status(401).json({
//         success: false,
//         message: "Invalid OTP",
//       });
//     }

//     // ✅ SUCCESS
//     staff.isVerified = true;
//     staff.lastLoginAt = new Date();
//     staff.lastLoginIP = req.ip;
//     staff.lastUserAgent = req.headers["user-agent"];

//     staff.otp = undefined;
//     staff.otpExpiresAt = undefined;
//     staff.otpAttempts = 0;

//     await staff.save();

//     log("info", "Login success", {
//       userId: staff._id,
//     });

//     const accessToken = jwt.sign(
//       { id: staff._id, phone: staff.phone },
//       process.env.JWT_ACCESS_SECRET,
//       { expiresIn: "7d" }
//     );

//     const refreshToken = jwt.sign(
//       { id: staff._id },
//       process.env.JWT_REFRESH_SECRET,
//       { expiresIn: "30d" }
//     );

//     log("info", "Tokens generated");
// return res.status(200).json({
//   success: true,
//   token: accessToken,
//   refreshToken,
//   staff: {
//     id: staff._id,
//     name: staff.name,
//     phone: staff.phone,
//     email: staff.email,
//     photo: staff.photo || null,
//     deviceId: staff.deviceId || null,
//     isFirstLogin: staff.isFirstLogin,        // ← ADD THIS
//     isProfileComplete: !!staff.photo,
//   },
// });

//   } catch (error) {
//     log("error", "VERIFY OTP ERROR", {
//       message: error.message,
//       stack: error.stack,
//     });

//     return res.status(500).json({
//       success: false,
//       message: "OTP verification failed",
//     });
//   }
// };
// exports.completeProfile = async (req, res) => {
//   try {
//     // Check both potential keys from your JWT payload
//     const staffId = req.user.id || req.user.riderId; 

//     if (!staffId) {
//       return res.status(401).json({ message: "Invalid token payload" });
//     }

//     if (!req.file) {
//       return res.status(400).json({ message: "Please upload a photo" });
//     }

//     // Cloudinary ya local storage path (assuming you use middleware)
//     const photoUrl = req.file.path; 

//     const staff = await Staff.findByIdAndUpdate(
//       staffId,
//       { 
//         photo: photoUrl, 
//         isFirstLogin: false 
//       },
//       { new: true }
//     );

//     if (!staff) {
//       console.log("❌ Staff not found for ID:", staffId);
//       return res.status(404).json({ message: "Staff member not found" });
//     }

//     res.status(200).json({ 
//       success: true, 
//       message: "Profile completed", 
//       photoUrl: staff.photo 
//     });
//   } catch (error) {
//     console.error("Profile Error:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };

// exports.verifyFace = async (req, res) => {
//   try {
//     const staffId = req.user.id || req.user.riderId;
//     const staff = await Staff.findById(staffId);

//     if (!staff || !staff.photo) {
//       return res.status(404).json({ message: "Staff photo not found. Upload first." });
//     }

//     const livePhoto = req.file; // Captured from webcam

//     // YAHAN FACE MATCH LOGIC AAYEGA
//     // Example (Pseudo-code):
//     // const isMatch = await compareFaces(staff.photo, livePhoto.path);
//     const isMatch = true; // Temporary bypass for testing

//     if (!isMatch) {
//       return res.status(400).json({ message: "Face does not match!" });
//     }

//     res.status(200).json({ success: true, message: "Face verified" });
//   } catch (error) {
//     res.status(500).json({ message: "Face verification failed" });
//   }
// };
// // exports.completeProfile = async (req, res) => {
//   try {
//     console.log("📥 COMPLETE PROFILE HIT");

//     console.log("👉 Headers:", req.headers);
//     console.log("👉 User from token:", req.user);

//     // if (!req.user) {
//     //   console.error("❌ req.user missing");
//     //   return res.status(401).json({ message: "Unauthorized - no user" });
//     // }

//     const staff = await Staff.findById(req.user.id);

//     if (!staff) {
//       console.error("❌ Staff not found:", req.user.id);
//       return res.status(404).json({ message: "Staff not found" });
//     }

//     if (!req.file) {
//       console.warn("⚠️ No file uploaded");
//       return res.status(400).json({
//         message: "Photo required",
//       });
//     }

//     staff.photo = req.file.filename;

//     await staff.save();

//     console.log("✅ Profile updated:", staff._id);

//     res.json({
//       success: true,
//       message: "Profile completed",
//     });
//   } catch (err) {
//     console.error("🔥 COMPLETE PROFILE ERROR:", err);
//     res.status(500).json({ message: "Failed" });
//   }
// };