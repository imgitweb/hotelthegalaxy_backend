const express = require("express");
const router = express.Router();

const { updateProfile, sendOtp, verifyOtp } = require("../controllers/authController");
const auth = require("../middleware/auth");

router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.patch("/updateprofile", auth, updateProfile);

module.exports = router;
