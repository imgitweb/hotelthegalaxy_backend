const Attendance = require("../models/attendance"); // Model इम्पोर्ट करें

exports.markAttendance = async (req, res) => {
  try {
    // 1. Frontend से भेजा गया डेटा निकालें
    const { qrData, lat, lng, deviceId } = req.body;
    const staffId = req.staff.id; // verifyStaffToken/staffAuth मिडलवेयर से मिलेगा

    // 2. Photo चेक करें
    if (!req.file) {
      return res.status(400).json({ message: "Photo is required" });
    }

    // 3. QR Code Validate करें (.env वाले QR_ID से मैच करें)
    const expectedQrId = process.env.QR_ID;
    
    if (qrData !== expectedQrId) {
      return res.status(400).json({ 
        message: "Invalid QR Code. Please scan the correct Hotel QR." 
      });
    }

    // 4. Photo URL जनरेट करें
    // यह URL डेटाबेस में सेव होगा, ताकि Frontend इसे सीधा पढ़ सके
    const photoUrl = `/uploads/staff/${req.file.filename}`; 

    // 5. Database में Attendance Save करें
    const newAttendance = new Attendance({
      staffId: staffId,
      date: new Date(),
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

    // 6. Success Response
    return res.status(200).json({
      success: true,
      message: "Attendance marked successfully ✅",
      data: newAttendance
    });

  } catch (error) {
    console.error("Mark Attendance Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal Server Error while marking attendance." 
    });
  }
};