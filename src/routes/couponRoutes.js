const express = require("express");

const {
  createCoupon,
  getAllCoupons,
  updateCoupon,
  toggleCoupon,
  deleteCoupon,
  getCouponUsageReport,
  getActiveCoupons,
  validateCoupon,
} = require("../controllers/couponController.js");

// Middleware require setup
const adminAuthPkg = require("../middleware/adminAuth.js");
const userAuthPkg = require("../middleware/auth.js");

const { adminAuth } = adminAuthPkg;
const auth = userAuthPkg; // Agar auth file me module.exports direct function hai toh ye sahi kaam karega

const router = express.Router();

// ── Admin Routes (Protected) ─────────────────────
router.post("/", adminAuth, createCoupon);
router.get("/", adminAuth, getAllCoupons);
router.patch("/:id", adminAuth, updateCoupon);
router.patch("/:id/toggle", adminAuth, toggleCoupon);
router.delete("/admin/coupons/:id", adminAuth, deleteCoupon);
router.get("/:id/report", adminAuth, getCouponUsageReport);

// ── User Routes (Protected) ─────────────────────
router.get("/coupons", auth, getActiveCoupons);
router.post("/coupons/validate", auth, validateCoupon);

module.exports = router;