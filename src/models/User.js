const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      index: true,
      match: [/^(91)[6-9]\d{9}$/, "Invalid Indian mobile number"],
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
      sparse: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
      index: true,
    },

    otp: { type: String, select: false },

    otpExpiresAt: {
      type: Date,
      select: false,
      index: true,
    },

    otpLastRequestedAt: {
      type: Date,
      select: false,
    },

    otpRequestCount: {
      type: Number,
      default: 0,
      select: false,
    },

    otpRequestWindowStartedAt: {
      type: Date,
      select: false,
    },

    otpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    authProvider: {
      type: String,
      enum: ["otp", "whatsapp"],
      default: "otp",
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true,
  },
);


userSchema.index({ phone: 1, isVerified: 1 });

module.exports = mongoose.model("User", userSchema);
