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
  exportBulkCoupons,generateBulkCoupons ,deleteBulkBatch
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
router.delete("/:id", adminAuth, deleteCoupon);
router.get("/:id/report", adminAuth, getCouponUsageReport);
router.delete("/batch/:batchId", adminAuth, deleteBulkBatch);


// ... existing admin coupon routes
router.post("/bulk",adminAuth, generateBulkCoupons);
router.get("/export/:batchId",adminAuth, exportBulkCoupons);

// ── User Routes (Protected) ─────────────────────
router.get("/coupons",auth, getActiveCoupons);
router.post("/coupons/validate",auth ,validateCoupon);

module.exports = router;