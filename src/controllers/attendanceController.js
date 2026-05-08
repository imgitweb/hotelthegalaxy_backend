// ─── controllers/attendanceController.js ─────────────────────────────────────
const { attendance } = require("../models/attendance");
const Staff = require("../models/staffModel");
const Rider = require("../models/rider.model");

const { detectShift, getShiftDate } = require("../utils/shiftHelper");
const {
  calculateWorkingMs,
  msToHoursStr,
  msToHoursDecimal,
} = require("../utils/workingHoursHelper");

// ─── helpers ─────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

// ─────────────────────────────────────────────────────────────────────────────
// 1. Mark Attendance (Start of Shift)
// ─────────────────────────────────────────────────────────────────────────────
exports.markAttendance = async (req, res) => {
  try {
    const { qrData, lat, lng, deviceId, role } = req.body;

    const userId =
      req.riderId ||
      req.staff?.id ||
      req.user?.id ||
      req.user?._id ||
      req.user?.riderId;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: User ID not found" });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Photo is required" });
    }

    if (qrData !== process.env.QR_ID) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid QR Code" });
    }

    // ── Detect shift from current time ───────────────────────────────────────
    const now = new Date();
    const shift = detectShift(now);       // "Day" or "Night"
    const shiftDate = getShiftDate(now);  // canonical start-date for this shift

    // ── Check: already have an OPEN shift (any shift, not checked out) ───────
    const openShift = await attendance.findOne({
      staffId: userId,
      checkOutTime: null,
    });

    if (openShift) {
      return res.status(400).json({
        success: false,
        message: `You already have an active ${openShift.shift} shift. Please check out first before starting a new shift.`,
      });
    }

    // ── Check: already marked attendance for this exact shift + date ─────────
    const existingShift = await attendance.findOne({
      staffId: userId,
      shiftDate,
      shift,
    });

    if (existingShift) {
      return res.status(400).json({
        success: false,
        message: `${shift} shift attendance already marked for ${shiftDate}.`,
      });
    }

    // ── Determine role ───────────────────────────────────────────────────────
    let finalRole = "Staff";
    if (
      role?.toLowerCase() === "rider" ||
      req.riderId ||
      req.user?.riderId
    ) {
      finalRole = "Rider";
    }

    const newAttendance = new attendance({
      staffId: userId,
      role: finalRole,
      shift,
      shiftDate,
      date: shiftDate, // backward compat
      checkInTime: now,
      location: { lat: parseFloat(lat), lng: parseFloat(lng) },
      photo: `/uploads/${finalRole.toLowerCase()}/${req.file.filename}`,
      deviceId: deviceId || "unknown",
      status: "Present",
      dutyLogs: [
        { action: "CheckIn", time: now },
        { action: "Available", time: now },
      ],
    });

    await newAttendance.save();

    if (finalRole === "Rider") {
      await Rider.findByIdAndUpdate(userId, {
        lastAttendanceAt: now,
        status: "Available",
      });
    } else {
      await Staff.findByIdAndUpdate(userId, {
        lastAttendanceAt: now,
        status: "Available",
      });
    }

    return res.status(200).json({
      success: true,
      message: `${shift} shift attendance marked successfully for ${finalRole}`,
      data: newAttendance,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Attendance already marked for this shift today.",
      });
    }
    console.error("markAttendance error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Toggle Duty Status (Available ↔ Offline)
// ─────────────────────────────────────────────────────────────────────────────
exports.toggleDutyStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const userId =
      req.riderId ||
      req.staff?.id ||
      req.user?.id ||
      req.user?._id ||
      req.user?.riderId;

    if (!["Available", "Offline"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status. Use Available or Offline." });
    }

    // Find the currently open (active) shift — no checkout yet
    const activeShift = await attendance
      .findOne({ staffId: userId, checkOutTime: null })
      .sort({ checkInTime: -1 });

    if (!activeShift) {
      return res.status(404).json({
        success: false,
        message: "No active shift found. Please mark your attendance first!",
      });
    }

    activeShift.dutyLogs.push({ action: status, time: new Date() });
    await activeShift.save();

    if (activeShift.role === "Rider") {
      await Rider.findByIdAndUpdate(userId, { status });
    } else {
      await Staff.findByIdAndUpdate(userId, { status });
    }

    res.json({
      success: true,
      message: `Duty status changed to ${status}`,
      status,
    });
  } catch (error) {
    console.error("Toggle Status Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Checkout Attendance (End of Shift)
// ─────────────────────────────────────────────────────────────────────────────
exports.checkoutAttendance = async (req, res) => {
  try {
    const userId =
      req.riderId ||
      req.staff?.id ||
      req.user?.id ||
      req.user?._id ||
      req.user?.riderId;

    const now = new Date();

    // Find the currently open shift
    const activeShift = await attendance
      .findOne({ staffId: userId, checkOutTime: null })
      .sort({ checkInTime: -1 });

    if (!activeShift) {
      return res.status(404).json({
        success: false,
        message: "No active shift found. Nothing to check out from.",
      });
    }

    activeShift.checkOutTime = now;
    activeShift.dutyLogs.push({ action: "CheckOut", time: now });
    await activeShift.save();

    if (activeShift.role === "Rider") {
      await Rider.findByIdAndUpdate(userId, { status: "Offline" });
    } else {
      await Staff.findByIdAndUpdate(userId, { status: "Offline" });
    }

    // Calculate final working hours for response
    const workingMs = calculateWorkingMs(
      activeShift.dutyLogs,
      activeShift.checkOutTime
    );

    return res.status(200).json({
      success: true,
      message: "Shift ended successfully.",
      data: {
        ...activeShift._doc,
        workingHoursStr: msToHoursStr(workingMs),
        totalMinutes: Math.floor(workingMs / 60000),
      },
    });
  } catch (error) {
    console.error("checkoutAttendance error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Get Attendance List (Admin — with filters, search, pagination)
// ─────────────────────────────────────────────────────────────────────────────
exports.getAttendance = async (req, res) => {
  try {
    const {
      date = todayStr(),
      department = "",
      status = "",
      search = "",
      role = "",
      shift = "",    // NEW: filter by "Day" or "Night"
      page = 1,
      limit = 10,
    } = req.query;

    const pg = Math.max(1, parseInt(page));
    const lim = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pg - 1) * lim;

    const matchStage = {
      shiftDate: date, // use shiftDate for date filtering
      ...(status && { status }),
      ...(shift && { shift: { $regex: `^${shift}$`, $options: "i" } }),
    };

    const pipeline = [
      { $match: matchStage },

      {
        $lookup: {
          from: "staffs",
          localField: "staffId",
          foreignField: "_id",
          as: "staff",
        },
      },
      {
        $lookup: {
          from: "riders",
          localField: "staffId",
          foreignField: "_id",
          as: "rider",
        },
      },
      {
        $addFields: {
          user: {
            $cond: [
              { $gt: [{ $size: "$staff" }, 0] },
              { $arrayElemAt: ["$staff", 0] },
              { $arrayElemAt: ["$rider", 0] },
            ],
          },
        },
      },

      // Search filter
      ...(search
        ? [
            {
              $match: {
                $or: [
                  { "user.name": { $regex: search, $options: "i" } },
                  { "user.phone": { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
        : []),

      // Department filter
      ...(department
        ? [{ $match: { "user.department": department } }]
        : []),

      // Role filter
      ...(role
        ? [
            {
              $match: {
                role: { $regex: `^${role}$`, $options: "i" },
              },
            },
          ]
        : []),

      // Replace staffId field with populated user object
      {
        $addFields: {
          staffId: "$user",
        },
      },

      {
        $project: {
          staff: 0,
          rider: 0,
          user: 0,
        },
      },

      { $sort: { checkInTime: 1 } },

      {
        $facet: {
          data: [{ $skip: skip }, { $limit: lim }],
          total: [{ $count: "count" }],
        },
      },
    ];

    const result = await attendance.aggregate(pipeline);
    const data = result[0].data;
    const total = result[0].total[0]?.count || 0;

    // Add working hours to each record (calculated in JS for accuracy)
    const enriched = data.map((rec) => {
      const workingMs = calculateWorkingMs(rec.dutyLogs, rec.checkOutTime);
      return {
        ...rec,
        workingHoursStr: msToHoursStr(workingMs),
        totalMinutes: Math.floor(workingMs / 60000),
      };
    });

    return res.json({
      success: true,
      data: enriched,
      total,
      page: pg,
      totalPages: Math.ceil(total / lim),
    });
  } catch (err) {
    console.error("getAttendance error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Get Stats (Admin — today's summary)
// ─────────────────────────────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const date = req.query.date || todayStr();

    // Total headcount
    const totalStaff = await Staff.countDocuments({
      isActive: true,
      isDeleted: false,
    });
    const totalRiders = await Rider.countDocuments();
    const totalEmployees = totalStaff + totalRiders;

    // Fetch all attendance records for the date (using shiftDate)
    const records = await attendance.find({ shiftDate: date });

    const presentCount = records.length;

    // Calculate total working ms using the shared helper (accurate)
    let totalWorkingMs = 0;
    for (const rec of records) {
      totalWorkingMs += calculateWorkingMs(rec.dutyLogs, rec.checkOutTime);
    }

    const absent = Math.max(0, totalEmployees - presentCount);
    const totalWorkingHours = msToHoursDecimal(totalWorkingMs);

    // Break down by shift
    const dayShiftCount = records.filter((r) => r.shift === "Day").length;
    const nightShiftCount = records.filter((r) => r.shift === "Night").length;

    return res.json({
      success: true,
      data: {
        total: totalEmployees,
        staffCount: totalStaff,
        riderCount: totalRiders,
        present: presentCount,
        absent,
        totalWorkingHours,
        dayShift: dayShiftCount,
        nightShift: nightShiftCount,
      },
    });
  } catch (err) {
    console.error("getStats error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Get Weekly Summary (Admin)
// ─────────────────────────────────────────────────────────────────────────────
exports.getWeekly = async (req, res) => {
  try {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString("en-CA"));
    }

    // Fetch raw records for the week
    const records = await attendance
      .find({ shiftDate: { $in: days } })
      .lean();

    // Group by staffId
    const grouped = {};
    for (const rec of records) {
      const key = rec.staffId.toString();
      if (!grouped[key]) {
        grouped[key] = {
          staffId: rec.staffId,
          role: rec.role,
          records: [],
        };
      }
      grouped[key].records.push(rec);
    }

    // Lookup staff/rider names
    const staffIds = Object.keys(grouped).map(
      (k) => new (require("mongoose").Types.ObjectId)(k)
    );

    const [staffList, riderList] = await Promise.all([
      Staff.find({ _id: { $in: staffIds } })
        .select("name phone department")
        .lean(),
      Rider.find({ _id: { $in: staffIds } })
        .select("name phone department")
        .lean(),
    ]);

    const userMap = {};
    for (const s of staffList) userMap[s._id.toString()] = s;
    for (const r of riderList) userMap[r._id.toString()] = r;

    const result = Object.values(grouped).map((g) => {
      const user = userMap[g.staffId.toString()];
      const totalWorkingMs = g.records.reduce(
        (sum, rec) => sum + calculateWorkingMs(rec.dutyLogs, rec.checkOutTime),
        0
      );

      return {
        staffId: g.staffId,
        name: user?.name || "Unknown",
        phone: user?.phone || "N/A",
        department:
          user?.department ||
          (g.role === "Rider" ? "Riders Fleet" : "Unknown"),
        role: g.role,
        presentDays: g.records.length,
        absentDays: Math.max(0, 7 - g.records.length),
        workingHours: msToHoursDecimal(totalWorkingMs),
        workingHoursStr: msToHoursStr(totalWorkingMs),
        dayShifts: g.records.filter((r) => r.shift === "Day").length,
        nightShifts: g.records.filter((r) => r.shift === "Night").length,
      };
    });

    result.sort((a, b) => b.workingHours - a.workingHours);

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("getWeekly error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. Get Monthly Summary (Admin)
// ─────────────────────────────────────────────────────────────────────────────
exports.getMonthly = async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `${year}-${month}-`;

    // How many distinct shift-dates have records so far this month
    const distinctDays = await attendance.distinct("shiftDate", {
      shiftDate: { $regex: `^${prefix}` },
    });
    const workingDays = distinctDays.length || 1;

    // Fetch raw records
    const records = await attendance
      .find({ shiftDate: { $regex: `^${prefix}` } })
      .lean();

    // Group by staffId
    const grouped = {};
    for (const rec of records) {
      const key = rec.staffId.toString();
      if (!grouped[key]) {
        grouped[key] = { staffId: rec.staffId, role: rec.role, records: [] };
      }
      grouped[key].records.push(rec);
    }

    const staffIds = Object.keys(grouped).map(
      (k) => new (require("mongoose").Types.ObjectId)(k)
    );

    const [staffList, riderList] = await Promise.all([
      Staff.find({ _id: { $in: staffIds } })
        .select("name phone department")
        .lean(),
      Rider.find({ _id: { $in: staffIds } })
        .select("name phone department")
        .lean(),
    ]);

    const userMap = {};
    for (const s of staffList) userMap[s._id.toString()] = s;
    for (const r of riderList) userMap[r._id.toString()] = r;

    const result = Object.values(grouped).map((g) => {
      const user = userMap[g.staffId.toString()];
      const totalWorkingMs = g.records.reduce(
        (sum, rec) => sum + calculateWorkingMs(rec.dutyLogs, rec.checkOutTime),
        0
      );

      return {
        staffId: g.staffId,
        name: user?.name || "Unknown",
        phone: user?.phone || "N/A",
        department:
          user?.department ||
          (g.role === "Rider" ? "Riders Fleet" : "Unknown"),
        role: g.role,
        presentDays: g.records.length,
        absentDays: Math.max(0, workingDays - g.records.length),
        workingHours: msToHoursDecimal(totalWorkingMs),
        workingHoursStr: msToHoursStr(totalWorkingMs),
        dayShifts: g.records.filter((r) => r.shift === "Day").length,
        nightShifts: g.records.filter((r) => r.shift === "Night").length,
      };
    });

    result.sort((a, b) => b.workingHours - a.workingHours);

    return res.json({
      success: true,
      data: { workingDays, list: result },
    });
  } catch (err) {
    console.error("getMonthly error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. Get My Attendance Stats (Staff/Rider — personal view)
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyAttendanceStats = async (req, res) => {
  try {
    const staffId =
      req.user?.id ||
      req.staff?.id ||
      req.user?._id ||
      req.user?.riderId;

    const { month } = req.query; // Expected: "YYYY-MM"

    if (!staffId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let targetDate = new Date();
    if (month) {
      targetDate = new Date(`${month}-01`);
    }

    const y = targetDate.getFullYear();
    const m = targetDate.getMonth() + 1;
    const monthPrefix = `${y}-${m.toString().padStart(2, "0")}`;

    // Fetch all records for this month (by shiftDate)
    const records = await attendance
      .find({
        staffId,
        shiftDate: { $regex: `^${monthPrefix}` },
      })
      .sort({ shiftDate: -1, checkInTime: -1 })
      .lean();

    // Enrich each record with computed working hours
    const processedRecords = records.map((record) => {
      const workingMs = calculateWorkingMs(
        record.dutyLogs,
        record.checkOutTime
      );
      return {
        ...record,
        workingHoursStr: msToHoursStr(workingMs),
        totalMinutes: Math.floor(workingMs / 60000),
      };
    });

    // For present count: count unique shiftDates (one day = present even with 2 shifts)
    const uniqueDates = new Set(records.map((r) => r.shiftDate));
    const presentCount = uniqueDates.size;

    // Days passed in this month
    const today = new Date();
    const daysPassedInMonth =
      y === today.getFullYear() && m - 1 === today.getMonth()
        ? today.getDate()
        : new Date(y, m, 0).getDate();

    const absentCount = Math.max(0, daysPassedInMonth - presentCount);

    let performanceStatus = "Excellent";
    if (absentCount > 5) performanceStatus = "Poor";
    else if (absentCount > 2) performanceStatus = "Average";

    return res.status(200).json({
      success: true,
      stats: {
        present: presentCount,
        absent: absentCount,
        status: performanceStatus,
        recentLogs: processedRecords,
      },
    });
  } catch (error) {
    console.error("Fetch Stats Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching stats" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ALIASES — purane route names ke liye (routes file change nahi karni)
// ─────────────────────────────────────────────────────────────────────────────
exports.checkOut        = exports.checkoutAttendance;   // /checkout route
exports.toggleStatus    = exports.toggleDutyStatus;     // /status route
exports.getMyStats      = exports.getMyAttendanceStats; // /my-stats route