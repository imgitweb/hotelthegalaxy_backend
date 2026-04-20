const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 4,
      maxlength: 6,
      match: /^[A-Z0-9]{4,6}$/,   // alphanumeric only, 4–6 chars
    },
    discountType: {
      type: String,
      enum: ["flat", "percentage", "free_delivery"],
      required: true,
    },
    discountValue: {
      type: Number,
      default: 0,        // 0 for free_delivery type
    },
    maxDiscountCap: {
      type: Number,
      default: null,     // optional cap for percentage coupons
    },
    minOrderValue: {
      type: Number,
      default: 0,
    },
    validFrom: {
      type: Date,
      default: Date.now,
    },
    validTill: {
      type: Date,
      required: true,
    },
    usageLimit: {
      type: Number,
      default: null,     // null = unlimited global uses
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    perUserLimit: {
      type: Number,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,    // soft delete
    },
    description: {
      type: String,
      default: "",
    },
    tag: {
      type: String,
      default: "",       // e.g. "New User", "Flash Deal"
    },
  },
  { timestamps: true }
);


couponSchema.index({ isActive: 1, isDeleted: 1 });
module.exports = mongoose.model("Coupon", couponSchema);