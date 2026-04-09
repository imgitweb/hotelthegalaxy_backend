// controllers/attendanceController.js

const Attendance = require("../models/attendance");
const QRCodeSession = require("../models/qrSessionModel");
const Staff = require("../models/staffModel");

const log = (level, message, meta = {}) => {
  const data = { level, message, timestamp: new Date().toISOString(), ...meta };
  if (level === "error") console.error("🔥", data);
  else if (level === "warn") console.warn("⚠️", data);
  else console.log("ℹ️", data);
};

/**
 * ✅ VERIFY QR
 * POST /verify-qr
 * Body: { qrData: "code-string" }
 * Header: Bearer JWT (staffAuth middleware)
 */
exports.verifyQR = async (req, res) => {
  try {
    const { qrData } = req.body;

    if (!qrData) {
      return res.status(400).json({ success: false, message: "QR data missing" });
    }

    log("info", "QR verify attempt", { staffId: req.user.id, qrData });

    const session = await QRCodeSession.findOne({ code: qrData });

    if (!session) {
      log("warn", "QR not found", { qrData });
      return res.status(400).json({ success: false, message: "Invalid QR code" });
    }

    if (!session.isActive) {
      return res.status(400).json({ success: false, message: "QR code already used" });
    }

    if (session.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: "QR code expired" });
    }

    // ✅ QR valid — aaj ki duplicate attendance check
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await Attendance.findOne({
      staff: req.user.id,
      date: today,
    });

    if (existing?.checkInTime) {
      return res.status(409).json({
        success: false,
        message: "Attendance already marked today",
      });
    }

    log("info", "QR verified successfully", { staffId: req.user.id });

    return res.status(200).json({
      success: true,
      message: "QR valid. Proceed to capture photo.",
    });
  } catch (error) {
    log("error", "VERIFY QR ERROR", { message: error.message });
    return res.status(500).json({ success: false, message: "QR verification failed" });
  }
};

/**
 * 📸 MARK ATTENDANCE
 * POST /mark-attendance
 * Form-data: photo (file)
 * Header: Bearer JWT (staffAuth middleware)
 */
exports.markAttendance = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Photo required" });
    }

    const staffId = req.user.id;
    const deviceId = req.body.deviceId || null;

    log("info", "Mark attendance", { staffId, file: req.file.filename });

    // Aaj ki date (midnight normalized)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Duplicate check
    const existing = await Attendance.findOne({ staff: staffId, date: today });

    if (existing?.checkInTime) {
      return res.status(409).json({
        success: false,
        message: "Attendance already marked for today",
      });
    }

    const now = new Date();

    // Attendance create/update
    const attendance = existing
      ? existing
      : new Attendance({ staff: staffId, date: today });

    attendance.checkInTime = now;
    attendance.checkInPhoto = req.file.filename;
    attendance.deviceId = deviceId;
    attendance.status = "Present";
    attendance.isVerified = true;

    await attendance.save();

    // Staff lastAttendanceAt update
    await Staff.findByIdAndUpdate(staffId, { lastAttendanceAt: now });

    log("info", "Attendance marked", { staffId, attendanceId: attendance._id });

    return res.status(200).json({
      success: true,
      message: "Attendance marked successfully",
      data: {
        checkInTime: attendance.checkInTime,
        status: attendance.status,
      },
    });
  } catch (error) {
    // Duplicate key error (race condition)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Attendance already marked today",
      });
    }

    log("error", "MARK ATTENDANCE ERROR", { message: error.message });
    return res.status(500).json({ success: false, message: "Failed to mark attendance" });
  }
};