const express = require("express");
const router = express.Router();
const riderAuthController = require("../controllers/riderAuthController"); // Or wherever your auth logic is
const riderDashboardController = require("../controllers/riderDashboardController");
const auth = require("../middleware/auth");

// ==========================================
// NEWLY ADDED ROUTES
// ==========================================
// Public route to check if rider exists and has a password
router.post("/check-status", riderAuthController.checkRiderStatus); 

// Protected route to set password after OTP verification
router.post("/update-password", auth, riderAuthController.updatePassword); 
// ==========================================

router.post("/register", riderAuthController.registerRider);
router.post("/request-otp", riderAuthController.requestOtp);
router.post("/verify-otp", riderAuthController.verifyOtp);
router.post("/login", riderAuthController.loginRider);
router.get("/profile", auth, riderAuthController.getRiderProfile);
router.post("/logout", auth, riderAuthController.logoutRider);

// Dashboard routes
router.get("/active-trip", auth, riderDashboardController.getActiveTrip);
router.patch("/orders/:orderId/arrived", auth, riderDashboardController.markOrderArrived);
router.post("/orders/:orderId/verify-delivery", auth, riderDashboardController.verifyDeliveryOTP);
router.get("/history", auth, riderDashboardController.getRiderHistory);

module.exports = router;