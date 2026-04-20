import { Coupon } from "../models/couponModel.js";
import { CouponUsage } from "../models/couponUsageModel.js";

export const createCoupon = async (req, res) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      maxDiscountCap,
      minOrderValue,
      validFrom,
      validTill,
      usageLimit,
      perUserLimit,
      description,
      tag,
    } = req.body;

    // Validate code format: 4–6 alphanumeric chars
    const codeRegex = /^[A-Z0-9]{4,6}$/;
    if (!codeRegex.test(code?.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: "Coupon code must be 4–6 alphanumeric characters",
      });
    }

    const existing = await Coupon.findOne({
      code: code.toUpperCase(),
      isDeleted: false,
    });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Coupon code already exists" });
    }

    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      discountType,
      discountValue: discountValue || 0,
      maxDiscountCap: maxDiscountCap || null,
      minOrderValue: minOrderValue || 0,
      validFrom: validFrom || new Date(),
      validTill,
      usageLimit: usageLimit || null,
      perUserLimit: perUserLimit || 1,
      description,
      tag,
    });

    res.status(201).json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// ADMIN: Get all coupons (with usage stats)
// ─────────────────────────────────────────────
export const getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find({ isDeleted: false }).sort({
      createdAt: -1,
    });

    // Attach usage count per coupon
    const couponIds = coupons.map((c) => c._id);
    const usageCounts = await CouponUsage.aggregate([
      { $match: { coupon: { $in: couponIds } } },
      { $group: { _id: "$coupon", count: { $sum: 1 } } },
    ]);

    const usageMap = {};
    usageCounts.forEach((u) => {
      usageMap[u._id.toString()] = u.count;
    });

    const result = coupons.map((c) => ({
      ...c.toObject(),
      actualUsageCount: usageMap[c._id.toString()] || 0,
    }));

    res.json({ success: true, coupons: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// ADMIN: Update coupon
// ─────────────────────────────────────────────
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    // Don't allow changing the code itself (unique identifier)
    delete req.body.code;
    delete req.body.usedCount;

    const coupon = await Coupon.findByIdAndUpdate(
      id,
      { ...req.body },
      { new: true, runValidators: true }
    );

    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, message: "Coupon not found" });
    }

    res.json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// ADMIN: Toggle active status
// ─────────────────────────────────────────────
export const toggleCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, message: "Coupon not found" });
    }
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.json({
      success: true,
      message: `Coupon ${coupon.isActive ? "enabled" : "disabled"}`,
      coupon,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// ADMIN: Soft delete coupon
// ─────────────────────────────────────────────
export const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, isActive: false },
      { new: true }
    );
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, message: "Coupon not found" });
    }
    res.json({ success: true, message: "Coupon deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// ADMIN: Usage report for one coupon
// ─────────────────────────────────────────────
export const getCouponUsageReport = async (req, res) => {
  try {
    const { id } = req.params;
    const usages = await CouponUsage.find({ coupon: id })
      .populate("user", "fullName email")
      .populate("orderId", "orderNumber total")
      .sort({ createdAt: -1 });

    const totalDiscount = usages.reduce(
      (sum, u) => sum + u.discountApplied,
      0
    );

    res.json({
      success: true,
      totalUses: usages.length,
      totalDiscountGiven: totalDiscount,
      usages,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// USER: Get all available/active coupons
// ─────────────────────────────────────────────
export const getActiveCoupons = async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      isDeleted: false,
      validFrom: { $lte: now },
      validTill: { $gte: now },
    }).select(
      "code discountType discountValue maxDiscountCap minOrderValue validTill description tag"
    );

    res.json({ success: true, coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// USER: Validate & apply coupon (returns discount amount only, no order yet)
// ─────────────────────────────────────────────
export const validateCoupon = async (req, res) => {
  try {
    console.log("coupon.....................",req.body)
    const { code, orderTotal } = req.body;

    const userId = req.userId;
    console.log("coupon.....................",userId)

    if (!code || !orderTotal) {
      return res
        .status(400)
        .json({ success: false, message: "Code and orderTotal are required" });
    }

    const now = new Date();
    const coupon = await Coupon.findOne({
      code: code.toUpperCase(),
      isDeleted: false,
    });

    // 1. Exists?
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, message: "Invalid coupon code" });
    }

    // 2. Active?
    if (!coupon.isActive) {
      return res
        .status(400)
        .json({ success: false, message: "This coupon is no longer active" });
    }

    // 3. Expired?
    if (now < coupon.validFrom || now > coupon.validTill) {
      return res
        .status(400)
        .json({ success: false, message: "Coupon has expired" });
    }

    // 4. Minimum order?
    if (orderTotal < coupon.minOrderValue) {
      return res.status(400).json({
        success: false,
        message: `Add ₹${coupon.minOrderValue - orderTotal} more to use this coupon`,
      });
    }

    // 5. Global usage limit?
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      return res
        .status(400)
        .json({ success: false, message: "Coupon usage limit reached" });
    }

    // 6. Per-user limit?
    const userUsageCount = await CouponUsage.countDocuments({
      coupon: coupon._id,
      user: userId,
    });
    if (userUsageCount >= coupon.perUserLimit) {
      return res.status(400).json({
        success: false,
        message: "You have already used this coupon",
      });
    }

    // 7. Calculate discount
    let discount = 0;
    if (coupon.discountType === "flat") {
      discount = coupon.discountValue;
    } else if (coupon.discountType === "percentage") {
      discount = Math.round((orderTotal * coupon.discountValue) / 100);
      if (coupon.maxDiscountCap) {
        discount = Math.min(discount, coupon.maxDiscountCap);
      }
    } else if (coupon.discountType === "free_delivery") {
      discount = 0; // delivery fee waived on order creation
    }

    // Cap discount to order total
    discount = Math.min(discount, orderTotal);

    res.json({
      success: true,
      discount,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        freeDelivery: coupon.discountType === "free_delivery",
      },
      message: `Coupon applied! You save ₹${discount}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};