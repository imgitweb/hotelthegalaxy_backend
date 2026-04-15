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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/attendance/mark-attendance
// ─────────────────────────────────────────────────────────────────────────────
exports.markAttendance = async (req, res) => {
  try {
    // 1. Get role from the frontend request (defaulting to 'staff')
    const { qrData, lat, lng, deviceId, role = "staff" } = req.body;
    console.log(req.body)

    // 2. Safely extract the User ID
    // (req.riderId comes from Rider JWT, req.staff?.id comes from Staff JWT)
    const userId = req.riderId || req.user?.id || req.staff?.id || req.user?._id || req.user?.riderId

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Photo is required" });
    }
    if (qrData !== process.env.QR_ID) {
      return res.status(400).json({ success: false, message: "Invalid QR Code" });
    }

    // 3. Determine actual user type
    const isRider = !!req.riderId || role.toLowerCase() === "rider";

    // Set upload path dynamically based on role
    const folder = isRider ? "rider" : "staff";
    const photoUrl = `/uploads/${folder}/${req.file.filename}`;
    
    const now = new Date();
    const dateString = now.toLocaleDateString("en-CA");
    const status = isLate(now) ? "Late" : "Present";

    // 4. Create the Attendance Document
    const newAttendance = new attendance({
      staffId: userId, // Keeping your existing field name to prevent breaking the schema
      role: isRider ? "Rider" : "Staff", // Saving role to DB
      date: dateString,
      checkInTime: now,
      location: { lat: parseFloat(lat), lng: parseFloat(lng) },
      photo: photoUrl,
      deviceId: deviceId || "unknown",
      status, // "Present" or "Late"
    });

    await newAttendance.save();

    // 5. Update the correct User Collection based on Role
    if (isRider) {
      // 👇 YAHAN CHANGE KIYA HAI: Rider ko 'Available' mark kar diya
      await Rider.findByIdAndUpdate(userId, { 
        lastAttendanceAt: now,
        status: "Available" 
      });
    } else {
      await Staff.findByIdAndUpdate(userId, { lastAttendanceAt: now });
    }

    return res.status(200).json({
      success: true,
      message: `Attendance marked — ${status} ✅`,
      data: newAttendance,
    });
  } catch (error) {
    // Handle Duplicate Key Error (Unique compound index on staffId + date)
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: "Attendance already marked for today!" 
      });
    }

    console.error("markAttendance error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.toggleRiderStatus = async (req, res) => {
  try {
    const { status } = req.body; // Expects "Available" or "Offline"
    const riderId = req.user?.riderId;
    console.log(".......................this is rider id .........", riderId) // From auth middleware

    if (!["Available", "Offline"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    await Rider.findByIdAndUpdate(riderId, { status });

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

// 2. Checkout Attendance (End of Day)
exports.checkoutAttendance = async (req, res) => {
  try {
    const userId = req.riderId;
    const todayStr = new Date().toLocaleDateString("en-CA");

    // Aaj ki attendance record find karein
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

    // Mark check-out time
    todayAttendance.checkOutTime = new Date();
    await todayAttendance.save();

    // Rider ko force Offline mark karein
    await Rider.findByIdAndUpdate(userId, { status: "Offline" });

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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/attendance
// Query params: date, department, status, search, page, limit
// ─────────────────────────────────────────────────────────────────────────────
exports.getAttendance = async (req, res) => {
  try {
    const {
      date       = todayStr(),
      department = "",
      status     = "",
      search     = "",
      page       = 1,
      limit      = 10,
    } = req.query;

    const pg  = Math.max(1, parseInt(page));
    const lim = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pg - 1) * lim;

    // Build attendance query
    const attQuery = { date };
    if (status) attQuery.status = status;

    // If there's a staff/rider search filter, find matching IDs first
    let userIds = null;
    if (department || search) {
      let ids = [];
      
      // 1. Search in Staff Model
      const staffFilter = { isDeleted: false };
      if (department) staffFilter.department = department;
      if (search) {
        staffFilter.$or = [
          { name:  new RegExp(search, "i") },
          { phone: new RegExp(search, "i") },
        ];
      }
      const matchingStaff = await Staff.find(staffFilter).select("_id");
      ids = matchingStaff.map((s) => s._id);

      // 2. Search in Rider Model (If department filter is not strictly "Staff")
      if (!department && search) {
        const riderFilter = {
          $or: [
            { name:  new RegExp(search, "i") },
            { phone: new RegExp(search, "i") },
          ]
        };
        const matchingRiders = await Rider.find(riderFilter).select("_id");
        ids = ids.concat(matchingRiders.map(r => r._id));
      }

      attQuery.staffId = { $in: ids };
    }

    const [records, total] = await Promise.all([
      attendance
        .find(attQuery)
        // Mongoose automatically handles polymorphic populate if refPath is configured.
        // If not, this still works safely for matching refs.
        .populate({ path: "staffId", select: "name phone department role photo vehicleNumber" })
        .sort({ checkInTime: 1 })
        .skip(skip)
        .limit(lim),
      attendance.countDocuments(attQuery),
    ]);

    return res.json({
      success:    true,
      data:       records,
      total,
      page:       pg,
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
    const totalRiders = await Rider.countDocuments(); // Assume all valid riders
    const totalEmployees = totalStaff + totalRiders;

    // 2. Count by status for the date from Attendance table
    const agg = await attendance.aggregate([
      { $match: { date } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const counts = { Present: 0, Late: 0, Absent: 0 };
    agg.forEach((a) => { 
      if (counts[a._id] !== undefined) counts[a._id] = a.count; 
    });

    // 3. Exact Absent Calculation
    const markedCount = counts.Present + counts.Late;
    counts.Absent = Math.max(0, totalEmployees - markedCount);

    return res.json({
      success: true,
      data: {
        total:    totalEmployees, // Total (Staff + Riders)
        staffCount: totalStaff,
        riderCount: totalRiders,
        present:  counts.Present,
        late:     counts.Late,
        absent:   counts.Absent,
      },
    });
  } catch (err) {
    console.error("getStats error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/attendance/weekly
// Returns last 7 days aggregate
// ─────────────────────────────────────────────────────────────────────────────
exports.getWeekly = async (req, res) => {
  try {
    // Total Employees (Staff + Riders)
    const totalStaff = await Staff.countDocuments({ isActive: true, isDeleted: false });
    const totalRiders = await Rider.countDocuments();
    const totalEmployees = totalStaff + totalRiders;

    // Build last-7-day date strings
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        date:  d.toLocaleDateString("en-CA"),
        label: d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }),
      });
    }

    const dateStrings = days.map((d) => d.date);

    const agg = await attendance.aggregate([
      { $match: { date: { $in: dateStrings } } },
      {
        $group: {
          _id:     { date: "$date", status: "$status" },
          count:   { $sum: 1 },
        },
      },
    ]);

    // pivot
    const map = {};
    agg.forEach(({ _id, count }) => {
      if (!map[_id.date]) map[_id.date] = { Present: 0, Late: 0, Absent: 0 };
      if (map[_id.date][_id.status] !== undefined) map[_id.date][_id.status] = count;
    });

    const result = days.map(({ date, label }) => {
      const d = map[date] || { Present: 0, Late: 0 };
      const marked = d.Present + d.Late;
      return {
        date,
        label,
        present: d.Present,
        late:    d.Late,
        absent:  Math.max(0, totalEmployees - marked), // Use Total Employees
        total:   totalEmployees,
      };
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("getWeekly error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/attendance/monthly
// Returns current-month stats + per-department breakdown
// ─────────────────────────────────────────────────────────────────────────────
exports.getMonthly = async (req, res) => {
  try {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `${year}-${month}-`;  // "2025-04-"

    // Count distinct days in the month that have at least 1 record
    const distinctDays = await attendance.distinct("date", {
      date: { $regex: `^${prefix}` },
    });
    const workingDays = distinctDays.length || 1; // avoid div-by-zero

    // Total Employees (Staff + Riders)
    const totalStaff = await Staff.countDocuments({ isActive: true, isDeleted: false });
    const totalRiders = await Rider.countDocuments();
    const totalEmployees = totalStaff + totalRiders;

    // Aggregate by (date, status)
    const agg = await attendance.aggregate([
      { $match: { date: { $regex: `^${prefix}` } } },
      {
        $group: {
          _id:   { date: "$date", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Total attendances (present + late)
    let totalPresent = 0;
    agg.forEach(({ _id, count }) => {
      if (_id.status === "Present" || _id.status === "Late") totalPresent += count;
    });

    const avgAttendance = totalEmployees
      ? Math.round((totalPresent / (totalEmployees * workingDays)) * 100)
      : 0;
    const totalAbsences = Math.max(0, totalEmployees * workingDays - totalPresent);

    // Per-department breakdown (Including Riders as a distinct group)
    const deptAgg = await attendance.aggregate([
      { $match: { date: { $regex: `^${prefix}` } } },
      {
        $lookup: {
          from:         "staffs",
          localField:   "staffId",
          foreignField: "_id",
          as:           "staff",
        },
      },
      {
        $addFields: {
          staffInfo: { $arrayElemAt: ["$staff", 0] }
        }
      },
      {
        $group: {
          // Check if the attendance role says 'rider', if so group as 'Riders Fleet', otherwise use staff department
          _id: { 
             $cond: [
                { $regexMatch: { input: { $ifNull: ["$role", ""] }, regex: /rider/i } }, 
                "Riders Fleet", 
                { $ifNull: ["$staffInfo.department", "Other/Unknown"] } 
             ]
          },
          present: {
            $sum: { $cond: [{ $in: ["$status", ["Present", "Late"]] }, 1, 0] },
          },
          total: { $sum: 1 },
        },
      },
    ]);

    const byDept = deptAgg.map((d) => ({
      department: d._id,
      present:    d.present,
      total:      d.total,
      pct:        Math.round((d.present / Math.max(d.total, 1)) * 100),
    })).sort((a, b) => b.pct - a.pct);

    return res.json({
      success: true,
      data: { 
        workingDays, 
        avgAttendance, 
        totalAbsences, 
        byDept 
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
exports.getMyAttendanceStats = async (req, res) => {
  try {
    console.log("..................",req.user)
    const staffId = req.user?.id || req.staff?.id || req.user?._id || req.user?.riderId
    const { month } = req.query; // Format expected: "YYYY-MM"

    if (!staffId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Determine target month and year
    let targetDate = new Date();
    if (month) {
      targetDate = new Date(`${month}-01`);
    }
    
    const y = targetDate.getFullYear();
    const m = targetDate.getMonth() + 1;
    const monthPrefix = `${y}-${m.toString().padStart(2, '0')}`; // e.g. "2026-04"

    // Fetch all attendance for this staff in the selected month
    const records = await attendance.find({
      staffId: staffId,
      date: { $regex: `^${monthPrefix}` } // Matches dates starting with "YYYY-MM"
    }).sort({ checkInTime: -1 });

    let presentCount = 0;
    let lateCount = 0;

    records.forEach(record => {
      if (record.status === "Present") presentCount++;
      
      // Calculate Late Marks (Agar 10:15 AM ke baad aaya to late)
      const checkInHour = new Date(record.checkInTime).getHours();
      const checkInMin = new Date(record.checkInTime).getMinutes();
      if (checkInHour > 10 || (checkInHour === 10 && checkInMin > 15)) {
        lateCount++;
      }
    });

    // Calculate Absent Days
    const today = new Date();
    let daysPassedInMonth = 0;

    if (y === today.getFullYear() && (m - 1) === today.getMonth()) {
      daysPassedInMonth = today.getDate(); // Current month
    } else {
      daysPassedInMonth = new Date(y, m, 0).getDate(); // Past month total days
    }

    // Absent = Total days passed - Present Days
    let absentCount = daysPassedInMonth - presentCount;
    if (absentCount < 0) absentCount = 0; // Fallback

    // Define Performance Status
    let performance = "Excellent";
    if (lateCount > 3 || absentCount > 3) performance = "Average";
    if (lateCount > 6 || absentCount > 6) performance = "Poor";

    return res.status(200).json({
      success: true,
      stats: {
        totalDays: daysPassedInMonth,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        status: performance,
        recentLogs: records.slice(0, 5) // Send only the last 5 logs for the table
      }
    });

  } catch (error) {
    console.error("Fetch Stats Error:", error);
    return res.status(500).json({ success: false, message: "Error fetching stats" });
  }
};