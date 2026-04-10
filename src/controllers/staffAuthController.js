const Staff = require("../models/staffModel");
const jwt = require("jsonwebtoken");
const Attendance = require("../models/Attendance"); 
const { generateOTP, hashOTP } = require("../utils/otp");
const { normalizePhone } = require("../utils/normalizePhone");
const { sendAuthTemplate } = require("../utils/whatsaap/sendAuthTemplate");

const OTP_EXPIRY =
  Number(process.env.OTP_EXPIRY_MINUTES || 5) * 60 * 1000;

// ======================
// 📱 SEND OTP
// ======================
exports.sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    console.log("............","")

    const normalizedPhone = normalizePhone(phone);

    const staff = await Staff.findOne({ phone: normalizedPhone });

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const otp = generateOTP();
    const hashedOtp = hashOTP(otp);

    staff.otp = hashedOtp;
    staff.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY);

    await staff.save();

    await sendAuthTemplate("+" + normalizedPhone, otp);

    return res.json({ success: true, message: "OTP sent" });
  } catch (err) {
    res.status(500).json({ message: "Failed to send OTP" });
  }
};

// ======================
// 🔐 VERIFY OTP
// ======================
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp, deviceId } = req.body;

    const normalizedPhone = normalizePhone(phone);

    const staff = await Staff.findOne({ phone: normalizedPhone })
      .select("+otp +otpExpiresAt");

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    if (
      hashOTP(otp) !== staff.otp ||
      staff.otpExpiresAt < new Date()
    ) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    // CLEAR OTP
    staff.otp = undefined;
    staff.otpExpiresAt = undefined;

    // DEVICE LOCK
    if (!staff.deviceId && deviceId) {
      staff.deviceId = deviceId;
    }

    await staff.save();

    const token = jwt.sign(
      { id: staff._id },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      staff: {
        id: staff._id,
        name: staff.name,
        photo: staff.photo,
        isFirstLogin: staff.isFirstLogin,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Login failed" });
  }
};

// ======================
// 👤 COMPLETE PROFILE
// ======================
 exports.markAttendance = async (req, res) => {
  try {
    // 1. Frontend से भेजा गया डेटा निकालें
    const { qrData, lat, lng, deviceId } = req.body;
    const staffId = req.staff.id; // verifyStaffToken मिडलवेयर से मिलेगा

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

    // 4. (Optional) आप Backend में भी Distance चेक कर सकते हैं सिक्योरिटी के लिए 
    // ताकि कोई Fake GPS इस्तेमाल न कर सके। (अभी हम Frontend के डेटा पर भरोसा कर रहे हैं)

    // 5. Database में Attendance Save करें
    const photoUrl = `/uploads/${req.file.filename}`; // सेव की गई इमेज का पाथ

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