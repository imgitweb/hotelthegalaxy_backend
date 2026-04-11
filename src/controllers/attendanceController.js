const { attendance } = require("../models/attendance"); 

// ==========================================
// 1. MARK ATTENDANCE
// ==========================================
exports.markAttendance = async (req, res) => {
  try {
    const { qrData, lat, lng, deviceId } = req.body;
    const staffId = req.user?.id || req.staff?.id || req.user?._id; 

    if (!staffId) {
      return res.status(401).json({ message: "Unauthorized! User ID not found." });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Photo is required. Please capture a selfie." });
    }

    // QR Code Validation
    const expectedQrId = process.env.QR_ID;
    if (qrData !== expectedQrId) {
      return res.status(400).json({ 
        message: "Invalid QR Code. Please scan the correct Hotel QR." 
      });
    }

    const photoUrl = `/uploads/staff/${req.file.filename}`; 
    const todayString = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

    const newAttendance = new attendance({
      staffId: staffId,
      date: todayString, 
      checkInTime: new Date(),
      location: {
        lat: parseFloat(lat),
        lng: parseFloat(lng)
      },
      photo: photoUrl,
      deviceId: deviceId || "unknown",
      status: "Present"
    });

    await newAttendance.save();

    return res.status(200).json({
      success: true,
      message: "Attendance marked successfully ✅",
      data: newAttendance
    });

  } catch (error) {
    console.error("Mark Attendance Error:", error);
    // MongoDB Duplicate Key Error for today
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: "You have already marked your attendance for today!" 
      });
    }
    return res.status(500).json({ 
      success: false, 
      message: "Internal Server Error while marking attendance." 
    });
  }
};

// ==========================================
// 2. GET ATTENDANCE STATS (Naya Function)
// ==========================================
exports.getMyAttendanceStats = async (req, res) => {
  try {
    const staffId = req.user?.id || req.staff?.id || req.user?._id; 
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