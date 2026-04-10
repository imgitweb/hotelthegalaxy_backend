const Staff = require("../models/staffModel");
const jwt = require("jsonwebtoken");

const { generateOTP, hashOTP } = require("../utils/otp");
const { normalizePhone } = require("../utils/normalizePhone");
const { sendAuthTemplate } = require("../utils/whatsaap/sendAuthTemplate");

const OTP_EXPIRY =
  Number(process.env.OTP_EXPIRY_MINUTES || 5) * 60 * 1000;

// ======================
// 📱 SEND OTP
// ======================
exports.sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    const normalizedPhone = normalizePhone(phone);

    const staff = await Staff.findOne({ phone: normalizedPhone });

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const otp = generateOTP();
    const hashedOtp = hashOTP(otp);

    staff.otp = hashedOtp;
    staff.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY);

    await staff.save();

    await sendAuthTemplate("+" + normalizedPhone, otp);

    return res.json({ success: true, message: "OTP sent" });
  } catch (err) {
    res.status(500).json({ message: "Failed to send OTP" });
  }
};

// ======================
// 🔐 VERIFY OTP
// ======================
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp, deviceId } = req.body;

    const normalizedPhone = normalizePhone(phone);

    const staff = await Staff.findOne({ phone: normalizedPhone })
      .select("+otp +otpExpiresAt");

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    if (
      hashOTP(otp) !== staff.otp ||
      staff.otpExpiresAt < new Date()
    ) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    // CLEAR OTP
    staff.otp = undefined;
    staff.otpExpiresAt = undefined;

    // DEVICE LOCK
    if (!staff.deviceId && deviceId) {
      staff.deviceId = deviceId;
    }

    await staff.save();

    const token = jwt.sign(
      { id: staff._id },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      staff: {
        id: staff._id,
        name: staff.name,
        photo: staff.photo,
        isFirstLogin: staff.isFirstLogin,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Login failed" });
  }
};

// ======================
// 👤 COMPLETE PROFILE
// ======================
exports.completeProfile = async (req, res) => {
  try {
    const staffId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: "Photo required" });
    }

    const staff = await Staff.findByIdAndUpdate(
      staffId,
      {
        photo: req.file.filename,
        isFirstLogin: true,
      },
      { new: true }
    );

    return res.json({
      success: true,
      message: "Profile completed",
      staff,
    });
  } catch (err) {
    res.status(500).json({ message: "Upload failed" });
  }
};