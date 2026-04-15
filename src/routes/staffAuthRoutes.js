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
// MULTER SETUP
// ==========================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, "../../public/uploads/staff");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname.replace(/\s+/g, '-')); 
  },
});
const upload = multer({ storage: storage });

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================
router.post("/check-status", controller.checkStaffStatus); // Naya: Check if password exists
router.post("/login-password", controller.loginWithPassword); // Naya: Login with password
router.post("/send-otp", controller.sendOtp);
router.post("/verify-otp-set-password", controller.verifyOtpAndSetPassword);
router.patch("/status",staffAuth, attendanceController.toggleRiderStatus)

router.post("/checkout",staffAuth, attendanceController.checkoutAttendance) // Naya: Set password

// ==========================================
// ATTENDANCE ROUTE
// ==========================================
router.post(
  "/mark-attendance",
  staffAuth,
  upload.single("photo"),
  attendanceController.markAttendance
);

// Apni routes file mein ye line add karein:
router.get("/my-stats", staffAuth, attendanceController.getMyAttendanceStats);


module.exports = router;