const express = require("express");
const router = express.Router();

const controller = require("../controllers/staffAuthController");
const attendanceController = require("../controllers/attendanceController");

const { staffAuth } = require("../middleware/staffAuthMiddleware");
const upload = require("../middleware/upload");

router.post("/send-otp", controller.sendOtp);
router.post("/verify-otp", controller.verifyOtp);

router.post(
  "/complete-profile",
  staffAuth,
  upload.single("photo"),
  controller.completeProfile
);

router.post(
  "/mark-attendance",
  staffAuth,
  upload.single("photo"),
  attendanceController.markAttendance
);

module.exports = router;