const Attendance = require("../models/attendance");
const Staff = require("../models/staffModel");
const getDistance = require("../utils/distance");

exports.markAttendance = async (req, res) => {
  try {
    const staffId = req.user.id;
    const { qrData, deviceId, lat, lng } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "Photo required" });
    }

    // ✅ STATIC QR CHECK
    if (qrData !== process.env.ATTENDANCE_QR) {
      return res.status(400).json({ message: "Invalid QR" });
    }

    const staff = await Staff.findById(staffId);

    if (!staff || !staff.isActive) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // ✅ PROFILE CHECK
    if (!staff.photo || !staff.isFirstLogin) {
      return res.status(403).json({
        message: "Complete profile first",
      });
    }

    // ✅ DEVICE LOCK
    if (staff.deviceId && staff.deviceId !== deviceId) {
      return res.status(403).json({
        message: "Unauthorized device",
      });
    }

    // ✅ LOCATION CHECK
    const distance = getDistance(
      lat,
      lng,
      process.env.OFFICE_LAT,
      process.env.OFFICE_LNG
    );

    if (distance > process.env.OFFICE_RADIUS) {
      return res.status(403).json({
        message: "You are outside office",
      });
    }

    // ✅ ONE ATTENDANCE PER DAY
    const today = new Date().toISOString().split("T")[0];

    const existing = await Attendance.findOne({
      staff: staffId,
      date: today,
    });

    if (existing) {
      return res.status(409).json({
        message: "Attendance already marked today",
      });
    }

    const attendance = await Attendance.create({
      staff: staffId,
      date: today,
      checkInTime: new Date(),
      checkInPhoto: req.file.filename,
      deviceId,
      location: { lat, lng },
      status: "Present",
      isVerified: true,
    });

    await Staff.findByIdAndUpdate(staffId, {
      lastAttendanceAt: new Date(),
    });

    return res.json({
      success: true,
      message: "Attendance marked successfully",
      data: attendance,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};