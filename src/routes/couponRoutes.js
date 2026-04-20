import express from "express";

import {
  createCoupon,
  getAllCoupons,
  updateCoupon,
  toggleCoupon,
  deleteCoupon,
  getCouponUsageReport,
  getActiveCoupons,
  validateCoupon,
} from "../controllers/couponController.js";

// ✅ CommonJS middleware ko ESM me use karne ka sahi tarika
import adminAuthPkg from "../middleware/adminAuth.js";
import userAuthPkg from "../middleware/auth.js";

const { adminAuth } = adminAuthPkg;
const auth = userAuthPkg;

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

export default router;