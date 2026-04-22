const Coupon = require("../models/couponModel.js");
const CouponUsage = require("../models/couponUsageModel.js");

exports.createCoupon = async (req, res) => {
  try {
    const {
      code, discountType, discountValue, maxDiscountCap, minOrderValue,
      validFrom, validTill, usageLimit, perUserLimit, description, tag,
    } = req.body;

    const codeRegex = /^[A-Z0-9]{4,20}$/;
    if (!codeRegex.test(code?.toUpperCase())) {
      return res.status(400).json({ success: false, message: "Coupon code must be 4–20 alphanumeric characters" });
    }

    const existing = await Coupon.findOne({ code: code.toUpperCase(), isDeleted: false });
    if (existing) {
      return res.status(400).json({ success: false, message: "Coupon code already exists" });
    }

    const coupon = await Coupon.create({
      code: code.toUpperCase(), discountType, discountValue: discountValue || 0,
      maxDiscountCap: maxDiscountCap || null, minOrderValue: minOrderValue || 0,
      validFrom: validFrom || new Date(), validTill, usageLimit: usageLimit || null,
      perUserLimit: perUserLimit || 1, description, tag,
    });

    res.status(201).json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.generateBulkCoupons = async (req, res) => {
  try {
    const {
      count, prefix = "", codeLength = 8, discountType, discountValue,
      maxDiscountCap, minOrderValue, validFrom, validTill, description, tag
    } = req.body;

    if (!count || count < 1 || count > 50000) {
      return res.status(400).json({ success: false, message: "Count must be between 1 and 50000" });
    }

    const batchId = `BATCH-${Date.now()}`;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const generatedCodes = new Set();

    // Generate unique codes (using Set to prevent duplicates in current batch)
    while (generatedCodes.size < count) {
      let randomPart = "";
      for (let i = 0; i < codeLength; i++) {
        randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const fullCode = (prefix.toUpperCase() + randomPart).substring(0, 20);
      generatedCodes.add(fullCode);
    }

    const couponsArray = [];
    for (const code of generatedCodes) {
      couponsArray.push({
        code, discountType, discountValue: discountValue || 0,
        maxDiscountCap: maxDiscountCap || null, minOrderValue: minOrderValue || 0,
        validFrom: validFrom || new Date(), validTill,
        usageLimit: 1, // BULK RULE: 1 specific code can be used 1 time only globally
        perUserLimit: 1, // BULK RULE: 1 user can use 1 code 1 time
        description: description || "Bulk Generated Coupon",
        tag: tag || "Bulk",
        isBulk: true,
        batchId
      });
    }

    // Insert safely in DB
    const result = await Coupon.insertMany(couponsArray, { ordered: false });

    res.status(201).json({
      success: true,
      message: `Successfully generated ${result.length} coupons`,
      batchId
    });
  } catch (err) {
    // If ordered: false, it will still insert non-duplicates even if some clash
    if (err.code === 11000) {
      res.status(201).json({
        success: true,
        message: "Generated coupons (some skipped due to code collision)",
        batchId: req.body.batchId || `BATCH-${Date.now()}`
      });
    } else {
      res.status(500).json({ success: false, message: err.message });
    }
  }
};




exports.exportBulkCoupons = async (req, res) => {
  try {
    const { batchId } = req.params;
    const coupons = await Coupon.find({ batchId }).select("code discountType discountValue minOrderValue validTill isActive usedCount usageLimit -_id");

    if (!coupons.length) {
      return res.status(404).json({ success: false, message: "No coupons found for this batch" });
    }

    let csv = "Code,Discount Type,Discount Value,Min Order,Valid Till,Status,Usage\n";
    coupons.forEach(c => {
      const status = c.isActive ? "Active" : "Disabled";
      csv += `${c.code},${c.discountType},${c.discountValue},${c.minOrderValue},${new Date(c.validTill).toLocaleDateString("en-IN")},${status},${c.usedCount}/${c.usageLimit}\n`;
    });

    res.header("Content-Type", "text/csv");
    res.attachment(`coupons-${batchId}.csv`);
    return res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// ADMIN: Get all coupons (with usage stats)
// ─────────────────────────────────────────────
exports.getAllCoupons = async (req, res) => {
  try {
    // Fetching max 1000 newest in the table to prevent frontend crash
    const coupons = await Coupon.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(1000); 

    const couponIds = coupons.map((c) => c._id);
    const usageCounts = await CouponUsage.aggregate([
      { $match: { coupon: { $in: couponIds } } },
      { $group: { _id: "$coupon", count: { $sum: 1 } } },
    ]);

    const usageMap = {};
    usageCounts.forEach((u) => { usageMap[u._id.toString()] = u.count; });

    const result = coupons.map((c) => ({
      ...c.toObject(), actualUsageCount: usageMap[c._id.toString()] || 0,
    }));

    res.json({ success: true, coupons: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// ADMIN: Update coupon
// ─────────────────────────────────────────────
exports.updateCoupon = async (req, res) => {
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
exports.toggleCoupon = async (req, res) => {
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
exports.deleteCoupon = async (req, res) => {
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
exports.getCouponUsageReport = async (req, res) => {
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
exports.getActiveCoupons = async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      isDeleted: false,
      isBulk: false,
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
// USER: Validate & apply coupon
// ─────────────────────────────────────────────


exports.validateCoupon = async (req, res) => {
  try {
    console.log(".......................",req.body)
    const { code, orderTotal } = req.body;
    const userId = req.userId;
    console.log("this is a idddd .......................",userId)

    if (!code || !orderTotal) {
      return res.status(400).json({ 
        success: false, 
        message: "Code and orderTotal are required" 
      });
    }

    const now = new Date();
    const coupon = await Coupon.findOne({
      code: code.toUpperCase(),
      isDeleted: false,
    });

    // 1. Exists?
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Invalid coupon code" });
    }

    // 2. Active?
    if (!coupon.isActive) {
      return res.status(400).json({ success: false, message: "This coupon is no longer active" });
    }

    // 3. Expired?
    if (now < coupon.validFrom || now > coupon.validTill) {
      return res.status(400).json({ success: false, message: "Coupon has expired" });
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
      return res.status(400).json({ success: false, message: "Coupon usage limit reached" });
    }

    // 6. Per-user limit (for this specific code)?
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

    // ─────────────────────────────────────────────
    // 6.5 BATCH ID LIMIT CHECK (NEW LOGIC)
    // ─────────────────────────────────────────────
    if (coupon.isBulk && coupon.batchId) {
      // Step A: Find all coupon IDs that this user has used in the past
      const previousUsages = await CouponUsage.find({ user: userId }).select("coupon");
      const usedCouponIds = previousUsages.map((usage) => usage.coupon);

      // Step B: Check if any of those used coupons share the same batchId
      if (usedCouponIds.length > 0) {
        const usedFromSameBatch = await Coupon.findOne({
          _id: { $in: usedCouponIds },
          batchId: coupon.batchId
        });

        if (usedFromSameBatch) {
          return res.status(400).json({
            success: false,
            message: "You have already used a coupon from this promotional batch.",
          });
        }
      }
    }
    // ─────────────────────────────────────────────

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

    // Cap discount to order total (so discount is never more than order amount)
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