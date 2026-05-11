const { attendance } = require("../models/attendance");
const Staff = require("../models/staffModel");
const Rider = require("../models/rider.model");

// ─── constants ────────────────────────────────────────────────────────────────
const MAX_SHIFT_HOURS = 12; 
const AUTO_CLOSE_THRESHOLD_HOURS = 16; 

// ─── helpers ──────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toLocaleDateString("en-CA");

const calculateWorkingMs = (logs, shiftEnd = null) => {
  const sorted = [...logs].sort((a, b) => new Date(a.time) - new Date(b.time));
  let totalMs = 0;
  let availableStart = null;

  for (const log of sorted) {
    if (log.action === "Available") {
      availableStart = new Date(log.time);
    } else if ((log.action === "Offline" || log.action === "CheckOut") && availableStart) {
      totalMs += new Date(log.time) - availableStart;
      availableStart = null; // Break time calculation stopped here
    }
  }

  if (availableStart && shiftEnd) {
    totalMs += new Date(shiftEnd) - availableStart;
  }
  return totalMs;
};

const msToHoursMinutes = (ms) => {
  if (!ms || isNaN(ms)) return { hours: 0, minutes: 0, totalMinutes: 0, str: "0h 0m" };
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { hours, minutes, totalMinutes, str: `${hours}h ${minutes}m` };
};

const msToHoursStr = (ms) => {
  return msToHoursMinutes(ms).str;
};

const msToHoursDecimal = (ms) => {
  if (!ms || isNaN(ms)) return 0;
  return ms / (1000 * 60 * 60);
};

const getUserId = (req) => req.riderId || req.staff?.id || req.user?.id || req.user?._id || req.user?.riderId;

const getRole = (req, roleFromBody) => {
  if (roleFromBody?.toLowerCase() === "rider" || req.riderId || req.user?.riderId) return "Rider";
  return "Staff";
};

// ─── Auto-Close Shift Logic ───────────────────────────────────────────────────
const checkAndAutoCloseShift = async (userId) => {
  const activeShift = await attendance.findOne({ staffId: userId, checkOutTime: null });
  if (!activeShift) return null;

  const now = new Date();
  const durationMs = now - new Date(activeShift.shiftStart);

  // Agar shift 16 ghante se zyada open hai, toh auto-close with 12 hours
  if (durationMs > AUTO_CLOSE_THRESHOLD_HOURS * 60 * 60 * 1000) {
    const autoCheckoutTime = new Date(activeShift.shiftStart.getTime() + (MAX_SHIFT_HOURS * 60 * 60 * 1000));

    activeShift.dutyLogs.push(
      { action: "Offline", time: autoCheckoutTime, source: "system" },
      { action: "CheckOut", time: autoCheckoutTime, source: "system" }
    );
    activeShift.checkOutTime = autoCheckoutTime;
    activeShift.forcedCheckout = true;
    await activeShift.save();

    const Model = activeShift.role === "Rider" ? Rider : Staff;
    await Model.findByIdAndUpdate(userId, { status: "Offline" });

    return null; // Shift is successfully closed
  }
  return activeShift; // Shift is still actively running
};

// ─── 1. Mark Attendance (Check-In) ───────────────────────────────────────────
exports.markAttendance = async (req, res) => {
  try {
    const { qrData, lat, lng, deviceId, role } = req.body;
    const userId = getUserId(req);

    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!req.file) return res.status(400).json({ success: false, message: "Photo is required" });
    if (qrData !== process.env.QR_ID) return res.status(400).json({ success: false, message: "Invalid QR Code" });

    const activeShift = await checkAndAutoCloseShift(userId);
    
    if (activeShift) {
      return res.status(400).json({
        success: false,
        message: "Aapki ek shift pehle se chal rahi hai. Kripya pehle checkout karein.",
      });
    }

    const finalRole = getRole(req, role);
    const now = new Date();
    const dateString = now.toLocaleDateString("en-CA"); 

    const existing = await attendance.findOne({ staffId: userId, date: dateString });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Aapki attendance aaj ke liye pehle hi lag chuki hai!",
      });
    }

    const currentHour = now.getHours();
    const shiftType = (currentHour >= 22 || currentHour < 6) ? "Night" : "Day";

    const newAttendance = new attendance({
      staffId: userId,
      role: finalRole,
      shift: shiftType,
      date: dateString,
      shiftStart: now,         
      checkInTime: now,
      location: { lat: parseFloat(lat), lng: parseFloat(lng) },
      photo: `/uploads/${finalRole.toLowerCase()}/${req.file.filename}`,
      deviceId: deviceId || "unknown",
      status: "Present",
      dutyLogs: [
        { action: "CheckIn", time: now, source: "system" },
        { action: "Available", time: now, source: "system" },
      ],
    });

    await newAttendance.save();

    const Model = finalRole === "Rider" ? Rider : Staff;
    await Model.findByIdAndUpdate(userId, { lastAttendanceAt: now, status: "Available" });

    return res.status(200).json({
      success: true,
      message: `Attendance marked successfully ✅`,
      data: newAttendance,
    });
  } catch (error) {
    console.error("markAttendance error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// ─── 2. Toggle Duty Status (Available ↔ Offline) ─────────────────────────────
exports.toggleDutyStatus = async (req, res) => {
  try {
    const { status, source = "manual" } = req.body;
    const userId = getUserId(req);

    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const activeShift = await checkAndAutoCloseShift(userId);

    if (!activeShift) {
      return res.status(404).json({ success: false, message: "Koi active shift nahi mili." });
    }

    const lastLog = activeShift.dutyLogs[activeShift.dutyLogs.length - 1];
    if (lastLog && lastLog.action === status) {
      return res.json({ success: true, message: `Already ${status}`, status, alreadySet: true });
    }

    activeShift.dutyLogs.push({ action: status, time: new Date(), source });
    await activeShift.save();

    const Model = activeShift.role === "Rider" ? Rider : Staff;
    await Model.findByIdAndUpdate(userId, { status });

    return res.json({ success: true, message: `Duty status changed to ${status}`, status, source });
  } catch (error) {
    console.error("toggleDutyStatus error:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ─── 3. Checkout Attendance (End of Shift) ────────────────────────────────────
exports.checkoutAttendance = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const activeShift = await checkAndAutoCloseShift(userId);

    if (!activeShift) {
      return res.status(404).json({ success: false, message: "Koi active shift nahi mili." });
    }

    const now = new Date();
    
    activeShift.dutyLogs.push(
      { action: "Offline", time: now, source: "manual" },
      { action: "CheckOut", time: now, source: "manual" }
    );
    activeShift.checkOutTime = now;
    
    await activeShift.save();

    const workingMs = calculateWorkingMs(activeShift.dutyLogs, now);
    const { hours, minutes, totalMinutes } = msToHoursMinutes(workingMs);

    const Model = activeShift.role === "Rider" ? Rider : Staff;
    await Model.findByIdAndUpdate(userId, { status: "Offline" });

    return res.status(200).json({
      success: true,
      message: "Shift ended successfully. ✅",
      data: {
        shiftStart: activeShift.shiftStart,
        checkOutTime: now,
        forcedCheckout: false,
        workingHours: `${hours}h ${minutes}m`,
        totalMinutes,
      },
    });
  } catch (error) {
    console.error("checkoutAttendance error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// ─── 4. Get Attendance Records ────────────────────────────────────────────────
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

    // ✅ FIX: Use 'date' instead of 'shiftDate' to match MongoDB schema
    const matchStage = {
      date: date,
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

    const enrichedData = data.map((record) => {
      const workingMs = calculateWorkingMs(record.dutyLogs, record.checkOutTime);
      return {
        ...record,
        workingHoursStr: msToHoursStr(workingMs),
        workingHoursDecimal: msToHoursDecimal(workingMs)
      };
    });

    return res.json({
      success: true,
      data: enrichedData,
      total,
      page: pg,
      totalPages: Math.ceil(total / lim),
    });
  } catch (err) {
    console.error("getAttendance error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── 5. Get Daily Stats ───────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const date = req.query.date || todayStr();

    const totalStaff = await Staff.countDocuments({ isActive: true, isDeleted: false });
    const totalRiders = await Rider.countDocuments();
    const totalEmployees = totalStaff + totalRiders;

    // ✅ FIX: changed shiftDate to date
    const records = await attendance.find({ date: date });

    let presentCount = records.length;
    let totalWorkingMs = 0;

    for (const record of records) {
      totalWorkingMs += calculateWorkingMs(record.dutyLogs, record.checkOutTime);
    }

    const absent = Math.max(0, totalEmployees - presentCount);
    const totalWorkingHours = msToHoursDecimal(totalWorkingMs).toFixed(1);

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

// ─── 6. Get Weekly Attendance ─────────────────────────────────────────────────
exports.getWeekly = async (req, res) => {
  try {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString("en-CA"));
    }

    // ✅ FIX: changed shiftDate to date
    const records = await attendance.find({ date: { $in: days } });

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
        (sum, r) => sum + calculateWorkingMs(r.dutyLogs, r.checkOutTime),
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
        workingHours: msToHoursDecimal(totalWorkingMs),
        workingHoursStr: msToHoursStr(totalWorkingMs),
      };
    });

    result.sort((a, b) => b.workingHours - a.workingHours);
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("getWeekly error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── 7. Get Monthly Attendance ────────────────────────────────────────────────
exports.getMonthly = async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `${year}-${month}-`;

    // ✅ FIX: changed shiftDate to date
    const records = await attendance.find({ date: { $regex: `^${prefix}` } });

    // ✅ FIX: changed r.shiftDate to r.date
    const distinctDays = [...new Set(records.map((r) => r.date))];
    const workingDays = distinctDays.length || 1;

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
        (sum, r) => sum + calculateWorkingMs(r.dutyLogs, r.checkOutTime),
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
        workingHours: msToHoursDecimal(totalWorkingMs),
        workingHoursStr: msToHoursStr(totalWorkingMs),
      };
    });

    result.sort((a, b) => b.workingHours - a.workingHours);
    return res.json({ success: true, data: { workingDays, list: result } });
  } catch (err) {
    console.error("getMonthly error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── 8. Get Personal Attendance Stats ─────────────────────────────────────────
exports.getMyAttendanceStats = async (req, res) => {
  try {
    const staffId = getUserId(req);
    if (!staffId) return res.status(401).json({ message: "Unauthorized" });

    await checkAndAutoCloseShift(staffId);

    const { month } = req.query; 
    let targetDate = month ? new Date(`${month}-01`) : new Date();

    const y = targetDate.getFullYear();
    const m = targetDate.getMonth() + 1;
    const monthPrefix = `${y}-${m.toString().padStart(2, "0")}`;

    const records = await attendance
      .find({ staffId, date: { $regex: `^${monthPrefix}` } })
      .sort({ date: -1 });

    const processedRecords = records.map((record) => {
      const shiftEnd = record.checkOutTime || null;
      let effectiveEnd = shiftEnd;

      if (!shiftEnd) {
        const lastLog = record.dutyLogs[record.dutyLogs.length - 1];
        if (lastLog && lastLog.action === "Available") {
          effectiveEnd = new Date(); 
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
    const daysPassedInMonth = y === today.getFullYear() && m - 1 === today.getMonth()
        ? today.getDate()
        : new Date(y, m, 0).getDate();

    const absentCount = Math.max(0, daysPassedInMonth - presentCount);

    return res.status(200).json({
      success: true,
      stats: {
        present: presentCount,
        absent: absentCount,
        status: absentCount <= 2 ? "Excellent" : absentCount <= 5 ? "Average" : "Poor",
        recentLogs: processedRecords,
      },
    });
  } catch (error) {
    console.error("getMyAttendanceStats error:", error);
    return res.status(500).json({ success: false, message: "Error fetching stats" });
  }
};

exports.checkOut = exports.checkoutAttendance;
