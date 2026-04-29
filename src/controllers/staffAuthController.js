const Staff = require("../models/staffModel");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt"); // 🔐 Password hashing ke liye zaroori
const { generateOTP, hashOTP } = require("../utils/otp");
const { normalizePhone } = require("../utils/normalizePhone");
const { sendAuthTemplate } = require("../utils/whatsaap/sendAuthTemplate");


const OTP_EXPIRY = Number(process.env.OTP_EXPIRY_MINUTES || 5) * 60 * 1000;




exports.checkStaffStatus = async (req, res) => {
  try {
    const { phone } = req.body;
    const normalizedPhone = normalizePhone(phone);

    // select("+password") isliye kyunki model mein select: false hoga
    const staff = await Staff.findOne({ phone: normalizedPhone }).select("+password");

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    // Agar password exist karta hai toh true return karenge
    const hasPassword = !!staff.password;
    
    return res.json({ success: true, hasPassword });
  } catch (err) {
    res.status(500).json({ message: "Failed to check staff details" });
  }
};

// ======================
// 📱 SEND OTP
// ======================
exports.sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    const normalizedPhone = normalizePhone(phone);

    const staff = await Staff.findOne({ phone: normalizedPhone });
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    const otp = generateOTP();
    const hashedOtp = hashOTP(otp);

    staff.otp = hashedOtp;
    staff.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY);
    await staff.save();

    await sendAuthTemplate("+" + normalizedPhone, otp);

    return res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to send OTP" });
  }
};

// ======================
// 🔐 VERIFY OTP & SET PASSWORD (For First Login & Forgot Password)
// ======================
exports.verifyOtpAndSetPassword = async (req, res) => {
  try {
    const { phone, otp, password, deviceId } = req.body;
    const normalizedPhone = normalizePhone(phone);

    const staff = await Staff.findOne({ phone: normalizedPhone }).select("+otp +otpExpiresAt");

    if (!staff) return res.status(404).json({ message: "Staff not found" });

    if (hashOTP(otp) !== staff.otp || staff.otpExpiresAt < new Date()) {
      return res.status(401).json({ message: "Invalid or Expired OTP" });
    }

    // CLEAR OTP
    staff.otp = undefined;
    staff.otpExpiresAt = undefined;

    // HASH & SET NEW PASSWORD
    const salt = await bcrypt.genSalt(10);
    staff.password = await bcrypt.hash(password, salt);
    staff.isFirstLogin = false; // Registration complete ho gaya

    // DEVICE LOCK
    if (!staff.deviceId && deviceId) {
      staff.deviceId = deviceId;
    }

    await staff.save();

    const token = jwt.sign({ id: staff._id }, process.env.JWT_ACCESS_SECRET, { expiresIn: "7d" });

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
    res.status(500).json({ message: "Failed to verify and set password" });
  }
};

// ======================
// 🔑 LOGIN WITH PASSWORD (Regular Login)
// ======================
exports.loginWithPassword = async (req, res) => {
  try {
    const { phone, password, deviceId } = req.body;
    const normalizedPhone = normalizePhone(phone);

    const staff = await Staff.findOne({ phone: normalizedPhone }).select("+password");

    if (!staff || !staff.password) {
      return res.status(401).json({ message: "Invalid credentials or password not set" });
    }

    // CHECK PASSWORD
    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect Password" });
    }

    // DEVICE LOCK (Optional: Update logic as per your need)
    if (staff.deviceId && staff.deviceId !== deviceId) {
       // Ignore strict lock for now, or enforce it
       // return res.status(403).json({ message: "Unauthorized Device" });
    } else if (!staff.deviceId && deviceId) {
       staff.deviceId = deviceId;
       await staff.save();
    }

    const token = jwt.sign({ id: staff._id }, process.env.JWT_ACCESS_SECRET, { expiresIn: "7d" });

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