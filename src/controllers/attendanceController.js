const { attendance } = require("../models/attendance");
const Staff = require("../models/staffModel");
const Rider = require("../models/rider.model");

// ─── constants ────────────────────────────────────────────────────────────────
const MIN_SHIFT_HOURS = 12; // Minimum shift duration enforced at checkout

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Returns "YYYY-MM-DD" for today in local time */
const todayStr = () => new Date().toLocaleDateString("en-CA");

/**
 * Calculates total working milliseconds from dutyLogs.
 * Only "Available → Offline/CheckOut" chunks are counted.
 * Ignores CheckIn, CheckOut logs for time calculation.
 *
 * @param {Array}  logs        - dutyLogs array from attendance record
 * @param {Date}   shiftEnd    - The final checkout time (used to close an open Available chunk)
 * @returns {number}           - Total working time in milliseconds
 */
const calculateWorkingMs = (logs, shiftEnd = null) => {
  const sorted = [...logs].sort((a, b) => new Date(a.time) - new Date(b.time));

  let totalMs = 0;
  let availableStart = null;

  for (const log of sorted) {
    if (log.action === "Available") {
      // Start a new chunk (overwrite if duplicate Available without Offline in between)
      availableStart = new Date(log.time);
    } else if ((log.action === "Offline" || log.action === "CheckOut") && availableStart) {
      // Close the current chunk
      totalMs += new Date(log.time) - availableStart;
      availableStart = null;
    }
    // CheckIn is ignored for working hours calculation
  }

  // If shift ended while still Available (e.g. forgot to go Offline before checkout)
  if (availableStart && shiftEnd) {
    totalMs += new Date(shiftEnd) - availableStart;
  }

  return totalMs;
};

/**
 * Converts milliseconds to { hours, minutes, str }
 */
const msToHoursMinutes = (ms) => {
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { hours, minutes, totalMinutes, str: `${hours}h ${minutes}m` };
};

/**
 * Resolves the userId from multiple possible req fields
 */
const getUserId = (req) =>
  req.riderId ||
  req.staff?.id ||
  req.user?.id ||
  req.user?._id ||
  req.user?.riderId;

/**
 * Determines the role of the user
 */
const getRole = (req, roleFromBody) => {
  if (
    roleFromBody?.toLowerCase() === "rider" ||
    req.riderId ||
    req.user?.riderId
  ) {
    return "Rider";
  }
  return "Staff";
};

// ─── 1. Mark Attendance (Check-In) ───────────────────────────────────────────
/**
 * POST /api/attendance/mark
 * Body: { qrData, lat, lng, deviceId, role }
 * File: photo (multipart)
 *
 * FIX: Uses shiftStart (full timestamp) instead of relying on `date` string
 *      for midnight-crossing shift lookups.
 */
exports.markAttendance = async (req, res) => {
  try {
    const { qrData, lat, lng, deviceId, role } = req.body;
    const userId = getUserId(req);

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

    const finalRole = getRole(req, role);
    const now = new Date();
    const dateString = now.toLocaleDateString("en-CA"); // YYYY-MM-DD

    // Check if already checked in today
    const existing = await attendance.findOne({
      staffId: userId,
      date: dateString,
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Aapki attendance aaj ke liye pehle hi lag chuki hai!",
      });
    }

    const newAttendance = new attendance({
      staffId: userId,
      role: finalRole,
      date: dateString,        // Stored for admin date-based queries
      shiftStart: now,         // ✅ Full timestamp — used for midnight crossing & 12h check
      checkInTime: now,
      location: { lat: parseFloat(lat), lng: parseFloat(lng) },
      photo: `/uploads/${finalRole.toLowerCase()}/${req.file.filename}`,
      deviceId: deviceId || "unknown",
      status: "Present",
      dutyLogs: [
        { action: "CheckIn",   time: now, source: "system" },
        { action: "Available", time: now, source: "system" },
      ],
    });

    await newAttendance.save();

    const Model = finalRole === "Rider" ? Rider : Staff;
    await Model.findByIdAndUpdate(userId, {
      lastAttendanceAt: now,
      status: "Available",
    });

    return res.status(200).json({
      success: true,
      message: `Attendance marked successfully for ${finalRole} ✅`,
      data: newAttendance,
    });
  } catch (error) {
    console.error("markAttendance error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

// ─── 2. Toggle Duty Status (Available ↔ Offline) ─────────────────────────────
/**
 * POST /api/attendance/toggle
 * Body: { status: "Available" | "Offline", source: "manual" | "geo" }
 *
 * FIX 1: `source` field stored in dutyLog — prevents geo from overriding manual break.
 * FIX 2: Midnight-safe lookup using shiftStart timestamp range instead of date string.
 *
 * Frontend rule (enforce this on client side too):
 *   - If offlineSource === "manual", geofence enter should NOT send "Available"
 *   - Only the manual "Go Online" button should send "Available" in that case
 */
exports.toggleDutyStatus = async (req, res) => {
  try {
    const { status, source = "manual" } = req.body;
    const userId = getUserId(req);

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized" });
    }

    if (!["Available", "Offline"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status. Use 'Available' or 'Offline'." });
    }

    if (!["manual", "geo", "system"].includes(source)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid source. Use 'manual', 'geo', or 'system'." });
    }

    // ✅ FIX: Midnight-safe lookup
    // Instead of matching by date string, find a shift that:
    //   - Belongs to this user
    //   - Has no checkOutTime yet (still active)
    //   - Started within the last 30 hours (covers any overnight shift)
    const cutoff = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const activeShift = await attendance.findOne({
      staffId: userId,
      checkOutTime: null,
      shiftStart: { $gte: cutoff },
    });

    if (!activeShift) {
      return res.status(404).json({
        success: false,
        message: "Koi active shift nahi mili. Pehle check-in karein.",
      });
    }

    // ✅ Prevent duplicate consecutive same-status logs
    const lastLog = activeShift.dutyLogs[activeShift.dutyLogs.length - 1];
    if (lastLog && lastLog.action === status) {
      return res.json({
        success: true,
        message: `Already ${status}`,
        status,
        alreadySet: true,
      });
    }

    activeShift.dutyLogs.push({ action: status, time: new Date(), source });
    await activeShift.save();

    const Model = activeShift.role === "Rider" ? Rider : Staff;
    await Model.findByIdAndUpdate(userId, { status });

    return res.json({
      success: true,
      message: `Duty status changed to ${status}`,
      status,
      source,
    });
  } catch (error) {
    console.error("toggleDutyStatus error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server Error" });
  }
};

// ─── 3. Checkout Attendance (End of Shift) ────────────────────────────────────
/**
 * POST /api/attendance/checkout
 *
 * FIX 1: Midnight-safe lookup using shiftStart, not date string.
 * FIX 2: Enforces minimum 12-hour shift duration.
 *        If staff checks out early, checkOutTime is set to shiftStart + 12h.
 * FIX 3: Working hours calculated from Available chunks, not checkIn→checkOut diff.
 */
exports.checkoutAttendance = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized" });
    }

    // ✅ FIX: Midnight-safe active shift lookup
    const cutoff = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const activeShift = await attendance.findOne({
      staffId: userId,
      checkOutTime: null,
      shiftStart: { $gte: cutoff },
    });

    if (!activeShift) {
      return res.status(404).json({
        success: false,
        message: "Koi active shift nahi mili.",
      });
    }

    const now = new Date();
    const shiftDurationMs = now - new Date(activeShift.shiftStart);
    const minDurationMs = MIN_SHIFT_HOURS * 60 * 60 * 1000;

    // ✅ FIX: 12-hour minimum enforcement
    let checkoutTime = now;
    let forcedCheckout = false;

    if (shiftDurationMs < minDurationMs) {
      checkoutTime = new Date(
        new Date(activeShift.shiftStart).getTime() + minDurationMs
      );
      forcedCheckout = true;
    }

    // ✅ Log Offline + CheckOut at the enforced checkout time
    activeShift.dutyLogs.push(
      { action: "Offline",   time: checkoutTime, source: "system" },
      { action: "CheckOut",  time: checkoutTime, source: "system" }
    );
    activeShift.checkOutTime = checkoutTime;
    activeShift.forcedCheckout = forcedCheckout;

    await activeShift.save();

    // ✅ FIX: Calculate working hours from Available chunks only
    const workingMs = calculateWorkingMs(activeShift.dutyLogs, checkoutTime);
    const { hours, minutes, totalMinutes } = msToHoursMinutes(workingMs);

    const Model = activeShift.role === "Rider" ? Rider : Staff;
    await Model.findByIdAndUpdate(userId, { status: "Offline" });

    return res.status(200).json({
      success: true,
      message: forcedCheckout
        ? `Shift 12 ghante se pehle end nahi ho sakti. Checkout time: ${checkoutTime.toLocaleTimeString()} set kiya gaya. ⚠️`
        : "Shift ended successfully. ✅",
      data: {
        shiftStart: activeShift.shiftStart,
        checkOutTime: checkoutTime,
        forcedCheckout,
        workingHours: `${hours}h ${minutes}m`,
        totalMinutes,
      },
    });
  } catch (error) {
    console.error("checkoutAttendance error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

// ─── 4. Get All Attendance (Admin) ───────────────────────────────────────────
/**
 * GET /api/admin/attendance
 * Query: date, department, status, search, role, page, limit
 */
exports.getAttendance = async (req, res) => {
  try {
    const {
      date = todayStr(),
      department = "",
      status = "",
      search = "",
      role = "",
      page = 1,
      limit = 10,
    } = req.query;

    const pg = Math.max(1, parseInt(page));
    const lim = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pg - 1) * lim;

    const matchStage = {
      date,
      ...(status && { status }),
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
      ...(department
        ? [{ $match: { "user.department": department } }]
        : []),
      ...(role
        ? [{ $match: { role: { $regex: `^${role}$`, $options: "i" } } }]
        : []),
      { $addFields: { staffId: "$user" } },
      { $project: { staff: 0, rider: 0, user: 0 } },
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

    return res.json({
      success: true,
      data,
      total,
      page: pg,
      totalPages: Math.ceil(total / lim),
    });
  } catch (err) {
    console.error("getAttendance error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── 5. Get Stats (Admin Dashboard) ─────────────────────────────────────────
/**
 * GET /api/admin/attendance/stats
 * Query: date (YYYY-MM-DD)
 *
 * FIX: Working hours now calculated from Available chunks via dutyLogs,
 *      not from checkIn→checkOut difference.
 */
exports.getStats = async (req, res) => {
  try {
    const date = req.query.date || todayStr();

    const totalStaff = await Staff.countDocuments({ isActive: true, isDeleted: false });
    const totalRiders = await Rider.countDocuments();
    const totalEmployees = totalStaff + totalRiders;

    const records = await attendance.find({ date });

    let presentCount = records.length;
    let totalWorkingMs = 0;

    for (const record of records) {
      // ✅ FIX: Use Available-chunk calculation instead of checkIn→checkOut
      totalWorkingMs += calculateWorkingMs(
        record.dutyLogs,
        record.checkOutTime || null
      );
    }

    const absent = Math.max(0, totalEmployees - presentCount);
    const totalWorkingHours = (totalWorkingMs / 3600000).toFixed(1);

    return res.json({
      success: true,
      data: {
        total: totalEmployees,
        staffCount: totalStaff,
        riderCount: totalRiders,
        present: presentCount,
        absent,
        totalWorkingHours,
      },
    });
  } catch (err) {
    console.error("getStats error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── 6. Get Weekly Report (Admin) ────────────────────────────────────────────
/**
 * GET /api/admin/attendance/weekly
 *
 * FIX: Working hours from Available chunks.
 */
exports.getWeekly = async (req, res) => {
  try {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString("en-CA"));
    }

    const records = await attendance.find({ date: { $in: days } });

    // Group by staffId
    const grouped = {};
    for (const record of records) {
      const id = record.staffId.toString();
      if (!grouped[id]) {
        grouped[id] = { staffId: record.staffId, role: record.role, records: [] };
      }
      grouped[id].records.push(record);
    }

    // Lookup user info
    const [allStaff, allRiders] = await Promise.all([
      Staff.find({}, "name phone department").lean(),
      Rider.find({}, "name phone").lean(),
    ]);
    const userMap = {};
    for (const s of allStaff) userMap[s._id.toString()] = { ...s, dept: s.department };
    for (const r of allRiders) userMap[r._id.toString()] = { ...r, dept: "Riders Fleet" };

    const result = Object.values(grouped).map(({ staffId, role, records }) => {
      const id = staffId.toString();
      const user = userMap[id];
      const totalWorkingMs = records.reduce(
        (sum, r) => sum + calculateWorkingMs(r.dutyLogs, r.checkOutTime || null),
        0
      );
      return {
        staffId,
        name: user?.name || "Unknown",
        phone: user?.phone || "N/A",
        department: user?.dept || (role === "Rider" ? "Riders Fleet" : "Unknown"),
        role,
        presentDays: records.length,
        absentDays: Math.max(0, 7 - records.length),
        workingHours: (totalWorkingMs / 3600000).toFixed(1),
      };
    });

    result.sort((a, b) => b.workingHours - a.workingHours);

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("getWeekly error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── 7. Get Monthly Report (Admin) ───────────────────────────────────────────
/**
 * GET /api/admin/attendance/monthly
 *
 * FIX: Working hours from Available chunks.
 */
exports.getMonthly = async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `${year}-${month}-`;

    const records = await attendance.find({ date: { $regex: `^${prefix}` } });

    const distinctDays = [...new Set(records.map((r) => r.date))];
    const workingDays = distinctDays.length || 1;

    // Group by staffId
    const grouped = {};
    for (const record of records) {
      const id = record.staffId.toString();
      if (!grouped[id]) {
        grouped[id] = { staffId: record.staffId, role: record.role, records: [] };
      }
      grouped[id].records.push(record);
    }

    const [allStaff, allRiders] = await Promise.all([
      Staff.find({}, "name phone department").lean(),
      Rider.find({}, "name phone").lean(),
    ]);
    const userMap = {};
    for (const s of allStaff) userMap[s._id.toString()] = { ...s, dept: s.department };
    for (const r of allRiders) userMap[r._id.toString()] = { ...r, dept: "Riders Fleet" };

    const result = Object.values(grouped).map(({ staffId, role, records }) => {
      const id = staffId.toString();
      const user = userMap[id];
      const totalWorkingMs = records.reduce(
        (sum, r) => sum + calculateWorkingMs(r.dutyLogs, r.checkOutTime || null),
        0
      );
      return {
        staffId,
        name: user?.name || "Unknown",
        phone: user?.phone || "N/A",
        department: user?.dept || (role === "Rider" ? "Riders Fleet" : "Unknown"),
        role,
        presentDays: records.length,
        absentDays: Math.max(0, workingDays - records.length),
        workingHours: (totalWorkingMs / 3600000).toFixed(1),
      };
    });

    result.sort((a, b) => b.workingHours - a.workingHours);

    return res.json({ success: true, data: { workingDays, list: result } });
  } catch (err) {
    console.error("getMonthly error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── 8. Get My Attendance Stats (Staff/Rider Self View) ──────────────────────
/**
 * GET /api/attendance/my-stats
 * Query: month (YYYY-MM)
 *
 * FIX 1: Midnight-safe — uses shiftStart-based lookup for active shift.
 * FIX 2: Working hours from Available chunks only.
 * FIX 3: Live running hours shown for ongoing shift (currently Available).
 */
exports.getMyAttendanceStats = async (req, res) => {
  try {
    const staffId = getUserId(req);
    if (!staffId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { month } = req.query; // "YYYY-MM"

    let targetDate = new Date();
    if (month) targetDate = new Date(`${month}-01`);

    const y = targetDate.getFullYear();
    const m = targetDate.getMonth() + 1;
    const monthPrefix = `${y}-${m.toString().padStart(2, "0")}`;

    const records = await attendance
      .find({ staffId, date: { $regex: `^${monthPrefix}` } })
      .sort({ date: -1 });

    const processedRecords = records.map((record) => {
      const shiftEnd = record.checkOutTime || null;

      // ✅ For ongoing shifts: if last log is "Available" and no checkout yet,
      //    count up to right now so live hours are visible
      let effectiveEnd = shiftEnd;
      if (!shiftEnd) {
        const lastLog = record.dutyLogs[record.dutyLogs.length - 1];
        if (lastLog && lastLog.action === "Available") {
          effectiveEnd = new Date(); // Live calculation
        }
      }

      const workingMs = calculateWorkingMs(record.dutyLogs, effectiveEnd);
      const { hours, minutes, totalMinutes } = msToHoursMinutes(workingMs);

      return {
        ...record._doc,
        workingHoursStr: `${hours}h ${minutes}m`,
        totalMinutes,
        isOngoing: !shiftEnd,
      };
    });

    const presentCount = processedRecords.length;
    const today = new Date();
    const daysPassedInMonth =
      y === today.getFullYear() && m - 1 === today.getMonth()
        ? today.getDate()
        : new Date(y, m, 0).getDate();

    const absentCount = Math.max(0, daysPassedInMonth - presentCount);

    return res.status(200).json({
      success: true,
      stats: {
        present: presentCount,
        absent: absentCount,
        status:
          absentCount <= 2 ? "Excellent" : absentCount <= 5 ? "Average" : "Poor",
        recentLogs: processedRecords,
      },
    });
  } catch (error) {
    console.error("getMyAttendanceStats error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching stats" });
  }
};

exports.checkOut = exports.checkoutAttendance;