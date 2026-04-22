// const { attendance } = require("../models/attendance"); 

// exports.markAttendance = async (req, res) => {
//   try {
//     const { qrData, lat, lng, deviceId } = req.body;
    
    
//     const staffId = req.user?.id || req.staff?.id || req.user?._id; 

//     if (!staffId) {
//       return res.status(401).json({ message: "Unauthorized! User ID not found." });
//     }

    
//     if (!req.file) {
//       return res.status(400).json({ message: "Photo is required. Please capture a selfie." });
//     }

//     // 4. QR Code Validate करें (.env से)
//     const expectedQrId = process.env.QR_ID;
    
//     if (qrData !== expectedQrId) {
//       return res.status(400).json({ 
//         message: "Invalid QR Code. Please scan the correct Hotel QR." 
//       });
//     }

    
//     const photoUrl = `/uploads/staff/${req.file.filename}`; 

    
//     const todayString = new Date().toLocaleDateString('en-CA'); // 'en-CA' हमेशा YYYY-MM-DD देता है

   
//     const newAttendance = new attendance({
//       staffId: staffId,
//       date: todayString, 
//       checkInTime: new Date(),
//       location: {
//         lat: parseFloat(lat),
//         lng: parseFloat(lng)
//       },
//       photo: photoUrl,
//       deviceId: deviceId || "unknown",
//       status: "Present"
//     });

    
//     await newAttendance.save();

//     // 9. Success Response Frontend को भेजें
//     return res.status(200).json({
//       success: true,
//       message: "Attendance marked successfully ✅",
//       data: newAttendance
//     });

//   } catch (error) {
//     console.error("Mark Attendance Error:", error);

//     // 🔥 अगर यूज़र ने आज की अटेंडेंस पहले ही लगा दी है (MongoDB Duplicate Key Error - 11000)
//     if (error.code === 11000) {
//       return res.status(400).json({ 
//         success: false, 
//         message: "You have already marked your attendance for today!" 
//       });
//     }

   
//     return res.status(500).json({ 
//       success: false, 
//       message: "Internal Server Error while marking attendance." 
//     });
//   }
// };



// ─── controllers/attendanceController.js ─────────────────────────────────────
const { attendance } = require("../models/attendance");
const Staff  = require("../models/staffModel");
const Rider  = require("../models/rider.model"); // Fixed capitalization convention

// ─── helpers ─────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

/** Returns true if the given Date is after 09:30 */
const isLate = (date) => {
  const h = date.getHours();
  const m = date.getMinutes();
  return h > 9 || (h === 9 && m > 30);
};



// 1. Mark Attendance (Start of Day)
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

    let finalRole = "Staff";
    if (role?.toLowerCase() === "rider" || req.riderId || req.user?.riderId) {
      finalRole = "Rider";
    }

    const now = new Date();
    // ✅ Fix: Use standard Date string format to avoid missing helper function errors
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
      // ✅ Log initial check-in and automatic "Available" status
      dutyLogs: [
        { action: "CheckIn", time: now },
        { action: "Available", time: now }
      ]
    });

    await newAttendance.save();

    if (finalRole === "Rider") {
      await Rider.findByIdAndUpdate(userId, { 
        lastAttendanceAt: now,
        status: "Available" 
      });
    } else {
      await Staff.findByIdAndUpdate(userId, { 
        lastAttendanceAt: now,
        status: "Available" 
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
        message: "Aapki attendance aaj ke liye pehle hi lag chuki hai!" 
      });
    }
    console.error("markAttendance error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// 2. Toggle Status (Track Online/Offline timestamps)
exports.toggleDutyStatus = async (req, res) => {
  try {
    const { status } = req.body; 
    console.log("req.body",req.body)
    const userId = req.riderId || req.staff?.id || req.user?.id || req.user?._id || req.user?.riderId;
    console.log("kkkkkkkkkkk",userId)

    if (!["Available", "Offline"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const todayStr = new Date().toLocaleDateString("en-CA");
    
    // Find today's attendance to push the toggle log
    const todayAttendance = await attendance.findOne({ staffId: userId, date: todayStr });

    if (!todayAttendance) {
      return res.status(404).json({ success: false, message: "Please mark your attendance first!" });
    }

    console.log("gggg",status)

    // ✅ Push the exact time the user toggled their status
    todayAttendance.dutyLogs.push({ action: status, time: new Date() });
    await todayAttendance.save();

    // Dynamically update either Rider or Staff collection based on their role
    if (todayAttendance.role === "Rider") {
      await Rider.findByIdAndUpdate(userId, { status });
    } else {
      await Staff.findByIdAndUpdate(userId, { status });
    }

    res.json({
      success: true,
      message: `Duty status changed to ${status}`,
      status
    });
  } catch (error) {
    console.error("Toggle Status Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 3. Checkout Attendance (End of Day)
exports.checkoutAttendance = async (req, res) => {
  try {
    const userId = req.riderId || req.staff?.id || req.user?.id || req.user?._id || req.user?.riderId;
    const now = new Date();
    const todayStr = now.toLocaleDateString("en-CA");

    const todayAttendance = await attendance.findOne({
      staffId: userId,
      date: todayStr,
    });

    if (!todayAttendance) {
      return res.status(404).json({ success: false, message: "Attendance not found for today." });
    }
    if (todayAttendance.checkOutTime) {
      return res.status(400).json({ success: false, message: "Already checked out." });
    }

    // ✅ Set checkout time and log the event
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


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/attendance/mark-attendance
// ─────────────────────────────────────────────────────────────────────────────
// exports.markAttendance = async (req, res) => {
//   try {
//     const { qrData, lat, lng, deviceId, role } = req.body;

//     // 1. User ID extract karna (Check all possible auth sources)
//     const userId = req.riderId || req.staff?.id || req.user?.id || req.user?._id || req.user?.riderId;

//     if (!userId) {
//       return res.status(401).json({ success: false, message: "Unauthorized: User ID not found" });
//     }

//     if (!req.file) {
//       return res.status(400).json({ success: false, message: "Photo is required" });
//     }

//     // QR Verification from .env
//     if (qrData !== process.env.QR_ID) {
//       return res.status(400).json({ success: false, message: "Invalid QR Code" });
//     }

//     // 2. Role define karna (Case-insensitive check)
//     // Agar frontend se role nahi aa raha toh token ke data se detect karein
//     let finalRole = "Staff";
//     if (role?.toLowerCase() === "rider" || req.riderId || req.user?.riderId) {
//       finalRole = "Rider";
//     }

//     const now = new Date();
//     const dateString = todayStr();

//     // 3. Create the Attendance Document
//     // Note: status hamesha "Present" rahega as per your request
//     const newAttendance = new attendance({
//       staffId: userId,
//       role: finalRole, 
//       date: dateString,
//       checkInTime: now,
//       location: { lat: parseFloat(lat), lng: parseFloat(lng) },
//       photo: `/uploads/${finalRole.toLowerCase()}/${req.file.filename}`,
//       deviceId: deviceId || "unknown",
//       status: "Present", 
//     });

//     await newAttendance.save();

//     // 4. Update the respective model (Rider or Staff)
//     if (finalRole === "Rider") {
//       await Rider.findByIdAndUpdate(userId, { 
//         lastAttendanceAt: now,
//         status: "Available" // Rider becomes online for orders
//       });
//     } else {
//       await Staff.findByIdAndUpdate(userId, { 
//         lastAttendanceAt: now,
//         status: "Available" // Optional: update staff status if you have a field
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message: `Attendance marked successfully for ${finalRole} ✅`,
//       data: newAttendance,
//     });

//   } catch (error) {
//     // 5. Handle Duplicate Key Error (Unique compound index on staffId + date)
//     if (error.code === 11000) {
//       return res.status(400).json({ 
//         success: false, 
//         message: "Aapki attendance aaj ke liye pehle hi lag chuki hai!" 
//       });
//     }

//     console.error("markAttendance error:", error);
//     return res.status(500).json({ success: false, message: "Internal Server Error" });
//   }
// };

// exports.toggleRiderStatus = async (req, res) => {
//   try {
//     const { status } = req.body; // Expects "Available" or "Offline"
//     const riderId = req.user?.riderId;
//     console.log(".......................this is rider id .........", riderId) // From auth middleware

//     if (!["Available", "Offline"].includes(status)) {
//       return res.status(400).json({ success: false, message: "Invalid status" });
//     }

//     await Rider.findByIdAndUpdate(riderId, { status });

//     res.json({
//       success: true,
//       message: `Duty status changed to ${status}`,
//       status
//     });
//   } catch (error) {
//     console.error("Toggle Status Error:", error);
//     res.status(500).json({ success: false, message: "Server Error" });
//   }
// };

// // 2. Checkout Attendance (End of Day)
// exports.checkoutAttendance = async (req, res) => {
//   try {
//     const userId = req.riderId || req.staff?.id || req.user?.id || req.user?._id || req.user?.riderId;
//     console.log("userId.........",userId)
//     const todayStr = new Date().toLocaleDateString("en-CA");

//     // Aaj ki attendance record find karein
//     const todayAttendance = await attendance.findOne({
//       staffId: userId,
//       date: todayStr,
//     });

//     if (!todayAttendance) {
//       return res.status(404).json({ success: false, message: "Attendance not found for today." });
//     }
//     if (todayAttendance.checkOutTime) {
//       return res.status(400).json({ success: false, message: "Already checked out." });
//     }

//     // Mark check-out time
//     todayAttendance.checkOutTime = new Date();
//     await todayAttendance.save();

//     // Rider ko force Offline mark karein
//     await Rider.findByIdAndUpdate(userId, { status: "Offline" });

//     return res.status(200).json({
//       success: true,
//       message: "Shift ended successfully.",
//       data: todayAttendance,
//     });
//   } catch (error) {
//     console.error("checkoutAttendance error:", error);
//     return res.status(500).json({ success: false, message: "Internal Server Error" });
//   }
// };

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/attendance/check-out
// ─────────────────────────────────────────────────────────────────────────────
exports.checkOut = async (req, res) => {
  try {
    const staffId = req.user?.id || req.staff?.id || req.user?._id;
    if (!staffId) return res.status(401).json({ message: "Unauthorized" });

    const today = todayStr();
    const record = await attendance.findOne({ staffId, date: today });
    if (!record) return res.status(404).json({ message: "No check-in found for today" });
    if (record.checkOutTime) return res.status(400).json({ message: "Already checked out" });

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

  // 🔥 SEARCH
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
    ? [
        {
          $match: {
            role: { $regex: `^${role}$`, $options: "i" },
          },
        },
      ]
    : []),

  // ✅ 🔥 FIX HERE
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/attendance/stats
// Query: date (YYYY-MM-DD)
// Returns: { total, present, late, absent }
// ─────────────────────────────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const date = req.query.date || todayStr();

    // 1. Calculate TOTAL Employees (Staff + Riders)
    const totalStaff = await Staff.countDocuments({ isActive: true, isDeleted: false });
    const totalRiders = await Rider.countDocuments(); 
    const totalEmployees = totalStaff + totalRiders;

    // 2. Count Present and Total Working Hours for the date
    const agg = await attendance.aggregate([
      { $match: { date } },
      {
        $group: {
          _id: null,
          presentCount: { $sum: 1 },
          totalWorkingMs: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ["$checkOutTime", null] }, { $ne: ["$checkInTime", null] }] },
                { $subtract: [{ $toDate: "$checkOutTime" }, { $toDate: "$checkInTime" }] },
                0
              ]
            }
          }
        }
      }
    ]);

    const present = agg.length > 0 ? agg[0].presentCount : 0;
    const totalWorkingMs = agg.length > 0 ? agg[0].totalWorkingMs : 0;
    const absent = Math.max(0, totalEmployees - present);
    
    // Convert ms to hours
    const totalWorkingHours = (totalWorkingMs / 3600000).toFixed(1);

    return res.json({
      success: true,
      data: {
        total: totalEmployees,
        staffCount: totalStaff,
        riderCount: totalRiders,
        present: present,
        absent: absent,
        totalWorkingHours: totalWorkingHours,
      },
    });
  } catch (err) {
    console.error("getStats error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/attendance/weekly
// Returns last 7 days PER-USER aggregate (Present, Absent, Hours)
// ─────────────────────────────────────────────────────────────────────────────
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
                { $and: [{ $ne: ["$checkOutTime", null] }, { $ne: ["$checkInTime", null] }] },
                { $subtract: [{ $toDate: "$checkOutTime" }, { $toDate: "$checkInTime" }] },
                0
              ]
            }
          }
        }
      },
      { $lookup: { from: "staffs", localField: "_id", foreignField: "_id", as: "staffInfo" } },
      { $lookup: { from: "riders", localField: "_id", foreignField: "_id", as: "riderInfo" } },
      {
        $project: {
          role: 1, presentDays: 1, totalWorkingMs: 1,
          user: {
            $cond: [
              { $gt: [{ $size: "$staffInfo" }, 0] },
              { $arrayElemAt: ["$staffInfo", 0] },
              { $arrayElemAt: ["$riderInfo", 0] }
            ]
          }
        }
      }
    ]);

    const result = agg.map((a) => ({
      staffId: a._id,
      name: a.user ? a.user.name : "Unknown",
      phone: a.user ? a.user.phone : "N/A",
      department: a.user?.department ? a.user.department : (a.role === "Rider" ? "Riders Fleet" : "Unknown"),
      role: a.role,
      presentDays: a.presentDays,
      absentDays: Math.max(0, 7 - a.presentDays), // 7 days in a week
      workingHours: (a.totalWorkingMs / 3600000).toFixed(1)
    }));

    // Sort by most working hours
    result.sort((a, b) => b.workingHours - a.workingHours);

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("getWeekly error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/attendance/monthly
// Returns current month PER-USER aggregate (Present, Absent, Hours)
// ─────────────────────────────────────────────────────────────────────────────
exports.getMonthly = async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `${year}-${month}-`; 

    // Find how many distinct days have records so far in this month
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
                { $and: [{ $ne: ["$checkOutTime", null] }, { $ne: ["$checkInTime", null] }] },
                { $subtract: [{ $toDate: "$checkOutTime" }, { $toDate: "$checkInTime" }] },
                0
              ]
            }
          }
        }
      },
      { $lookup: { from: "staffs", localField: "_id", foreignField: "_id", as: "staffInfo" } },
      { $lookup: { from: "riders", localField: "_id", foreignField: "_id", as: "riderInfo" } },
      {
        $project: {
          role: 1, presentDays: 1, totalWorkingMs: 1,
          user: {
            $cond: [
              { $gt: [{ $size: "$staffInfo" }, 0] },
              { $arrayElemAt: ["$staffInfo", 0] },
              { $arrayElemAt: ["$riderInfo", 0] }
            ]
          }
        }
      }
    ]);

    const result = agg.map((a) => ({
      staffId: a._id,
      name: a.user ? a.user.name : "Unknown",
      phone: a.user ? a.user.phone : "N/A",
      department: a.user?.department ? a.user.department : (a.role === "Rider" ? "Riders Fleet" : "Unknown"),
      role: a.role,
      presentDays: a.presentDays,
      absentDays: Math.max(0, workingDays - a.presentDays), 
      workingHours: (a.totalWorkingMs / 3600000).toFixed(1)
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

// ==========================================
// 2. GET ATTENDANCE STATS (Naya Function)
// ==========================================
// exports.getMyAttendanceStats = async (req, res) => {
//   try {
//     console.log("..................",req.user)
//     const staffId = req.user?.id || req.staff?.id || req.user?._id || req.user?.riderId
//     const { month } = req.query;
//     console.log("hhh ....................." ,req.query) // Format expected: "YYYY-MM"

//     if (!staffId) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     // Determine target month and year
//     let targetDate = new Date();
//     if (month) {
//       targetDate = new Date(`${month}-01`);
//     }
    
//     const y = targetDate.getFullYear();
//     const m = targetDate.getMonth() + 1;
//     const monthPrefix = `${y}-${m.toString().padStart(2, '0')}`; // e.g. "2026-04"

//     // Fetch all attendance for this staff in the selected month
//     const records = await attendance.find({
//       staffId: staffId,
//       date: { $regex: `^${monthPrefix}` } // Matches dates starting with "YYYY-MM"
//     }).sort({ checkInTime: -1 });

//     let presentCount = 0;
//     let lateCount = 0;

//     records.forEach(record => {
//       if (record.status === "Present") presentCount++;
      
//       // Calculate Late Marks (Agar 10:15 AM ke baad aaya to late)
//       const checkInHour = new Date(record.checkInTime).getHours();
//       const checkInMin = new Date(record.checkInTime).getMinutes();
//       if (checkInHour > 10 || (checkInHour === 10 && checkInMin > 15)) {
//         lateCount++;
//       }
//     });

//     // Calculate Absent Days
//     const today = new Date();
//     let daysPassedInMonth = 0;

//     if (y === today.getFullYear() && (m - 1) === today.getMonth()) {
//       daysPassedInMonth = today.getDate(); // Current month
//     } else {
//       daysPassedInMonth = new Date(y, m, 0).getDate(); // Past month total days
//     }

//     // Absent = Total days passed - Present Days
//     let absentCount = daysPassedInMonth - presentCount;
//     if (absentCount < 0) absentCount = 0; // Fallback

//     // Define Performance Status
//     let performance = "Excellent";
//     if (lateCount > 3 || absentCount > 3) performance = "Average";
//     if (lateCount > 6 || absentCount > 6) performance = "Poor";

//     return res.status(200).json({
//       success: true,
//       stats: {
//         totalDays: daysPassedInMonth,
//         present: presentCount,
//         absent: absentCount,
//         late: lateCount,
//         status: performance,
//         recentLogs: records.slice(0, 5) // Send only the last 5 logs for the table
//       }
//     });

//   } catch (error) {
//     console.error("Fetch Stats Error:", error);
//     return res.status(500).json({ success: false, message: "Error fetching stats" });
//   }
// };

exports.getMyAttendanceStats = async (req, res) => {
  try {
    const staffId = req.user?.id || req.staff?.id || req.user?._id || req.user?.riderId;
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
    const monthPrefix = `${y}-${m.toString().padStart(2, '0')}`;

    const records = await attendance.find({
      staffId: staffId,
      date: { $regex: `^${monthPrefix}` }
    }).sort({ date: -1 });

    const processedRecords = records.map(record => {
      let totalWorkingMs = 0;
      let logs = record.dutyLogs || [];

      // Logic: Calculate time between 'Available' and ('Offline' or 'CheckOut')
      for (let i = 0; i < logs.length; i++) {
        if (logs[i].action === "Available") {
          let startTime = new Date(logs[i].time).getTime();
          let endTime = null;

          // Find the next Offline or CheckOut
          for (let j = i + 1; j < logs.length; j++) {
            if (logs[j].action === "Offline" || logs[j].action === "CheckOut") {
              endTime = new Date(logs[j].time).getTime();
              i = j; // Move outer loop index
              break;
            }
          }

          // If currently 'Available' but no 'Offline/CheckOut' yet (Ongoing shift)
          if (!endTime && record.date === new Date().toLocaleDateString("en-CA")) {
             // Optional: endTime = Date.now(); // Uncomment to show live running hours
          }

          if (startTime && endTime) {
            totalWorkingMs += (endTime - startTime);
          }
        }
      }

      // Convert MS to Hours and Minutes
      const hours = Math.floor(totalWorkingMs / (1000 * 60 * 60));
      const minutes = Math.floor((totalWorkingMs % (1000 * 60 * 60)) / (1000 * 60));

      return {
        ...record._doc,
        workingHoursStr: `${hours}h ${minutes}m`,
        totalMinutes: (hours * 60) + minutes
      };
    });

    const presentCount = processedRecords.length;
    const today = new Date();
    let daysPassedInMonth = (y === today.getFullYear() && (m - 1) === today.getMonth()) 
        ? today.getDate() 
        : new Date(y, m, 0).getDate();

    let absentCount = Math.max(0, daysPassedInMonth - presentCount);

    return res.status(200).json({
      success: true,
      stats: {
        present: presentCount,
        absent: absentCount,
        status: absentCount <= 2 ? "Excellent" : absentCount <= 5 ? "Average" : "Poor",
        recentLogs: processedRecords // Frontend will display workingHoursStr from here
      }
    });

  } catch (error) {
    console.error("Fetch Stats Error:", error);
    return res.status(500).json({ success: false, message: "Error fetching stats" });
  }
};