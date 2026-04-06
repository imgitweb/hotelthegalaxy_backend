const express = require("express");
const router = express.Router();
const riderAuthController = require("../controllers/riderAuthController");
const riderDashboardController = require("../controllers/riderDashboardController");
const auth = require("../middleware/auth");

router.post("/register", riderAuthController.registerRider);
router.post("/request-otp", riderAuthController.requestOtp);
router.post("/verify-otp", riderAuthController.verifyOtp);
router.post("/login", riderAuthController.loginRider);
router.get("/profile", auth, riderAuthController.getRiderProfile);
router.post("/logout", auth, riderAuthController.logoutRider);


router.get("/active-trip", auth, riderDashboardController.getActiveTrip);
router.patch("/orders/:orderId/arrived", auth, riderDashboardController.markOrderArrived);
router.post("/orders/:orderId/verify-delivery", auth, riderDashboardController.verifyDeliveryOTP);
router.get("/history", auth, riderDashboardController.getRiderHistory);

module.exports = router;