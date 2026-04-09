const express = require("express");
const router = express.Router();
const controller = require("../controllers/staffAuthController");


const { staffAuth } = require("../middleware/staffAuthMiddleware");
const upload = require("../middleware/upload");
const attendanceController = require("../controllers/attendanceController");

router.post("/send-otp", controller.sendOtp);
router.post("/verify-otp", controller.verifyOtp);
router.post(
  "/complete-profile",
  staffAuth,
  upload.single("photo"),
  controller.completeProfile
);
router.post("/verify-qr", attendanceController.verifyQR);
router.post("/mark-attendance", upload.single("photo"), attendanceController.markAttendance);
module.exports = router;