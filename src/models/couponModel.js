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
      maxlength: 20,     // Updated for bulk prefix + random string
      match: /^[A-Z0-9]{4,20}$/, // alphanumeric only
    },
    discountType: {
      type: String,
      enum: ["flat", "percentage", "free_delivery"],
      required: true,
    },
    discountValue: {
      type: Number,
      default: 0,
    },
    maxDiscountCap: {
      type: Number,
      default: null,
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
      default: null,
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
      default: false,
    },
    description: {
      type: String,
      default: "",
    },
    tag: {
      type: String,
      default: "",
    },
    // New fields for Bulk Generation
    isBulk: {
      type: Boolean,
      default: false,
    },
    batchId: {
      type: String,
      default: null,     // Identifies which bulk action generated this
    }
  },
  { timestamps: true }
);

couponSchema.index({ isActive: 1, isDeleted: 1 });
couponSchema.index({ batchId: 1 }); // Index for fast exporting

module.exports = mongoose.model("Coupon", couponSchema);