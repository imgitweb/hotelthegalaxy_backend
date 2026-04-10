const { attendance } = require("../models/attendance"); 

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

    // 4. QR Code Validate करें (.env से)
    const expectedQrId = process.env.QR_ID;
    
    if (qrData !== expectedQrId) {
      return res.status(400).json({ 
        message: "Invalid QR Code. Please scan the correct Hotel QR." 
      });
    }

    
    const photoUrl = `/uploads/staff/${req.file.filename}`; 

    
    const todayString = new Date().toLocaleDateString('en-CA'); // 'en-CA' हमेशा YYYY-MM-DD देता है

   
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

    // 9. Success Response Frontend को भेजें
    return res.status(200).json({
      success: true,
      message: "Attendance marked successfully ✅",
      data: newAttendance
    });

  } catch (error) {
    console.error("Mark Attendance Error:", error);

    // 🔥 अगर यूज़र ने आज की अटेंडेंस पहले ही लगा दी है (MongoDB Duplicate Key Error - 11000)
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: "You have already marked your attendance for today!" 
      });
    }

    // अन्य कोई एरर आने पर
    return res.status(500).json({ 
      success: false, 
      message: "Internal Server Error while marking attendance." 
    });
  }
};