const { attendance } = require("../models/attendance");
const Staff = require("../models/staffModel");
const Rider = require("../models/rider.model");

const todayStr = () => new Date().toLocaleDateString("en-CA");

const isLate = (date) => {
  const h = date.getHours();
  const m = date.getMinutes();
  return h > 9 || (h === 9 && m > 30);
};

exports.markAttendance = async (req, res) => {
  try {
    const { qrData, lat, lng, deviceId, role } = req.body;

    const userId = req.riderId || req.staff?.id || req.user?.id || req.user?._id || req.user?.riderId;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: User ID not found" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Photo is required" });
    }

    if (qrData !== process.env.QR_ID) {
      return res.status(400).json({ success: false, message: "Invalid QR Code" });
    }

    const cutoff = new Date(Date.now() - 30 * 60 * 60 * 1000);

    const existingShift = await attendance.findOne({
      staffId: userId,
      checkInTime: { $gte: cutoff },
      checkOutTime: null,
    });

    if (existingShift) {
      return res.status(400).json({
        success: false,
        message: "Your attendance is already marked. Please checkout first!",
      });
    }

    let finalRole = "Staff";
    if (role?.toLowerCase() === "rider" || req.riderId || req.user?.riderId) {
      finalRole = "Rider";
    }

    const now = new Date();
    const dateString = now.toLocaleDateString("en-CA");

    const newAttendance = new attendance({
      staffId: userId,
      role: finalRole,
      date: dateString,
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
      message: `Attendance marked successfully for ${finalRole} ✅`,
      data: newAttendance,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Your attendance is already marked for this shift!",
      });
    }
    console.error("markAttendance error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.toggleDutyStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.riderId || req.staff?.id || req.user?.id || req.user?._id || req.user?.riderId;

    if (!["Available", "Offline"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const cutoff = new Date(Date.now() - 30 * 60 * 60 * 1000);

    const todayAttendance = await attendance.findOne({
      staffId: userId,
      checkInTime: { $gte: cutoff },
      checkOutTime: null,
    });

    if (!todayAttendance) {
      return res.status(404).json({ success: false, message: "Please mark your attendance first!" });
    }

    todayAttendance.dutyLogs.push({ action: status, time: new Date() });
    await todayAttendance.save();

    if (todayAttendance.role === "Rider") {
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

exports.checkoutAttendance = async (req, res) => {
  try {
    const userId = req.riderId || req.staff?.id || req.user?.id || req.user?._id || req.user?.riderId;
    const now = new Date();

    const cutoff = new Date(Date.now() - 30 * 60 * 60 * 1000);

    const todayAttendance = await attendance.findOne({
      staffId: userId,
      checkInTime: { $gte: cutoff },
      checkOutTime: null,
    });

    if (!todayAttendance) {
      return res.status(404).json({ success: false, message: "No active shift found." });
    }

    todayAttendance.checkOutTime = now;
    todayAttendance.dutyLogs.push({ action: "CheckOut", time: now });
    await todayAttendance.save();

    if (todayAttendance.role === "Rider") {
      await Rider.findByIdAndUpdate(userId, { status: "Offline" });
    } else {
      await Staff.findByIdAndUpdate(userId, { status: "Offline" });
    }

    return res.status(200).json({
      success: true,
      message: "Shift ended successfully.",
      data: todayAttendance,
    });
  } catch (error) {
    console.error("checkoutAttendance error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.checkOut = async (req, res) => {
  try {
    const staffId = req.user?.id || req.staff?.id || req.user?._id;
    if (!staffId) return res.status(401).json({ message: "Unauthorized" });

    const cutoff = new Date(Date.now() - 30 * 60 * 60 * 1000);

    const record = await attendance.findOne({
      staffId,
      checkInTime: { $gte: cutoff },
      checkOutTime: null,
    });

    if (!record) return res.status(404).json({ message: "No active shift found" });

    record.checkOutTime = new Date();
    await record.save();

    return res.json({ success: true, message: "Checked out ✅", data: record });
  } catch (err) {
    console.error("checkOut error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

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
      ...(department ? [{ $match: { "user.department": department } }] : []),
      ...(role
        ? [{ $match: { role: { $regex: `^${role}$`, $options: "i" } } }]
        : []),
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

exports.getStats = async (req, res) => {
  try {
    const date = req.query.date || todayStr();

    const totalStaff = await Staff.countDocuments({ isActive: true, isDeleted: false });
    const totalRiders = await Rider.countDocuments();
    const totalEmployees = totalStaff + totalRiders;

    const agg = await attendance.aggregate([
      { $match: { date } },
      {
        $group: {
          _id: null,
          presentCount: { $sum: 1 },
          totalWorkingMs: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$checkOutTime", null] },
                    { $ne: ["$checkInTime", null] },
                  ],
                },
                {
                  $subtract: [
                    { $toDate: "$checkOutTime" },
                    { $toDate: "$checkInTime" },
                  ],
                },
                0,
              ],
            },
          },
        },
      },
    ]);

    const present = agg.length > 0 ? agg[0].presentCount : 0;
    const totalWorkingMs = agg.length > 0 ? agg[0].totalWorkingMs : 0;
    const absent = Math.max(0, totalEmployees - present);
    const totalWorkingHours = (totalWorkingMs / 3600000).toFixed(1);

    return res.json({
      success: true,
      data: {
        total: totalEmployees,
        staffCount: totalStaff,
        riderCount: totalRiders,
        present,
        absent,
        totalWorkingHours,
      },
    });
  } catch (err) {
    console.error("getStats error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getWeekly = async (req, res) => {
  try {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString("en-CA"));
    }

    const agg = await attendance.aggregate([
      { $match: { date: { $in: days } } },
      {
        $group: {
          _id: "$staffId",
          role: { $first: "$role" },
          presentDays: { $sum: 1 },
          totalWorkingMs: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$checkOutTime", null] },
                    { $ne: ["$checkInTime", null] },
                  ],
                },
                {
                  $subtract: [
                    { $toDate: "$checkOutTime" },
                    { $toDate: "$checkInTime" },
                  ],
                },
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: "staffs",
          localField: "_id",
          foreignField: "_id",
          as: "staffInfo",
        },
      },
      {
        $lookup: {
          from: "riders",
          localField: "_id",
          foreignField: "_id",
          as: "riderInfo",
        },
      },
      {
        $project: {
          role: 1,
          presentDays: 1,
          totalWorkingMs: 1,
          user: {
            $cond: [
              { $gt: [{ $size: "$staffInfo" }, 0] },
              { $arrayElemAt: ["$staffInfo", 0] },
              { $arrayElemAt: ["$riderInfo", 0] },
            ],
          },
        },
      },
    ]);

    const result = agg.map((a) => ({
      staffId: a._id,
      name: a.user ? a.user.name : "Unknown",
      phone: a.user ? a.user.phone : "N/A",
      department: a.user?.department
        ? a.user.department
        : a.role === "Rider"
        ? "Riders Fleet"
        : "Unknown",
      role: a.role,
      presentDays: a.presentDays,
      absentDays: Math.max(0, 7 - a.presentDays),
      workingHours: (a.totalWorkingMs / 3600000).toFixed(1),
    }));

    result.sort((a, b) => b.workingHours - a.workingHours);

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("getWeekly error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getMonthly = async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `${year}-${month}-`;

    const distinctDays = await attendance.distinct("date", {
      date: { $regex: `^${prefix}` },
    });
    const workingDays = distinctDays.length || 1;

    const agg = await attendance.aggregate([
      { $match: { date: { $regex: `^${prefix}` } } },
      {
        $group: {
          _id: "$staffId",
          role: { $first: "$role" },
          presentDays: { $sum: 1 },
          totalWorkingMs: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$checkOutTime", null] },
                    { $ne: ["$checkInTime", null] },
                  ],
                },
                {
                  $subtract: [
                    { $toDate: "$checkOutTime" },
                    { $toDate: "$checkInTime" },
                  ],
                },
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: "staffs",
          localField: "_id",
          foreignField: "_id",
          as: "staffInfo",
        },
      },
      {
        $lookup: {
          from: "riders",
          localField: "_id",
          foreignField: "_id",
          as: "riderInfo",
        },
      },
      {
        $project: {
          role: 1,
          presentDays: 1,
          totalWorkingMs: 1,
          user: {
            $cond: [
              { $gt: [{ $size: "$staffInfo" }, 0] },
              { $arrayElemAt: ["$staffInfo", 0] },
              { $arrayElemAt: ["$riderInfo", 0] },
            ],
          },
        },
      },
    ]);

    const result = agg.map((a) => ({
      staffId: a._id,
      name: a.user ? a.user.name : "Unknown",
      phone: a.user ? a.user.phone : "N/A",
      department: a.user?.department
        ? a.user.department
        : a.role === "Rider"
        ? "Riders Fleet"
        : "Unknown",
      role: a.role,
      presentDays: a.presentDays,
      absentDays: Math.max(0, workingDays - a.presentDays),
      workingHours: (a.totalWorkingMs / 3600000).toFixed(1),
    }));

    result.sort((a, b) => b.workingHours - a.workingHours);

    return res.json({
      success: true,
      data: {
        workingDays,
        list: result,
      },
    });
  } catch (err) {
    console.error("getMonthly error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getMyAttendanceStats = async (req, res) => {
  try {
    const staffId =
      req.user?.id || req.staff?.id || req.user?._id || req.user?.riderId;
    const { month } = req.query;

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

    const records = await attendance
      .find({
        staffId: staffId,
        date: { $regex: `^${monthPrefix}` },
      })
      .sort({ date: -1 });

    const cutoff = new Date(Date.now() - 30 * 60 * 60 * 1000);

    const processedRecords = records.map((record) => {
      let totalWorkingMs = 0;
      let logs = record.dutyLogs || [];

      for (let i = 0; i < logs.length; i++) {
        if (logs[i].action === "Available") {
          let startTime = new Date(logs[i].time).getTime();
          let endTime = null;

          for (let j = i + 1; j < logs.length; j++) {
            if (
              logs[j].action === "Offline" ||
              logs[j].action === "CheckOut"
            ) {
              endTime = new Date(logs[j].time).getTime();
              i = j;
              break;
            }
          }

          if (
            !endTime &&
            new Date(record.checkInTime) >= cutoff &&
            !record.checkOutTime
          ) {
            endTime = Date.now();
          }

          if (startTime && endTime) {
            totalWorkingMs += endTime - startTime;
          }
        }
      }

      const hours = Math.floor(totalWorkingMs / (1000 * 60 * 60));
      const minutes = Math.floor(
        (totalWorkingMs % (1000 * 60 * 60)) / (1000 * 60)
      );

      return {
        ...record._doc,
        workingHoursStr: `${hours}h ${minutes}m`,
        totalMinutes: hours * 60 + minutes,
      };
    });

    const presentCount = processedRecords.length;
    const today = new Date();
    let daysPassedInMonth =
      y === today.getFullYear() && m - 1 === today.getMonth()
        ? today.getDate()
        : new Date(y, m, 0).getDate();

    let absentCount = Math.max(0, daysPassedInMonth - presentCount);

    return res.status(200).json({
      success: true,
      stats: {
        present: presentCount,
        absent: absentCount,
        status:
          absentCount <= 2
            ? "Excellent"
            : absentCount <= 5
            ? "Average"
            : "Poor",
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