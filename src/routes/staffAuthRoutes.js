const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");

// Controllers & Middlewares
const controller = require("../controllers/staffAuthController");
const attendanceController = require("../controllers/attendanceController");
const { staffAuth } = require("../middleware/staffAuthMiddleware");

// ==========================================
// MULTER SETUP (सीधा Routes के अंदर)
// ==========================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // पाथ सेट करें: रूट फ़ोल्डर के अंदर public/uploads/staff
    const dir = path.join(__dirname, "../../public/uploads/staff");
    
    // अगर फ़ोल्डर नहीं है, तो उसे बना दें
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // फ़ाइल का नाम यूनिक बनाने के लिए Date.now() का इस्तेमाल
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // स्पेस हटाकर डैश लगा रहे हैं ताकि URL में कोई दिक्कत न आए
    cb(null, uniqueSuffix + "-" + file.originalname.replace(/\s+/g, '-')); 
  },
});

const upload = multer({ storage: storage });

// ==========================================
// API ROUTES
// ==========================================

router.post("/send-otp", controller.sendOtp);
router.post("/verify-otp", controller.verifyOtp);

// Attendance Route
router.post(
  "/mark-attendance",
  staffAuth,
  upload.single("photo"), // frontend से 'photo' नाम से आने वाली इमेज
  attendanceController.markAttendance
);

module.exports = router;