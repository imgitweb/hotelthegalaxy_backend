const ROLE_MAP = require("../config/roleMap");
const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema(
  {
    // 🔹 BASIC INFO
    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true, // ✅ only this (no schema.index for phone)
    },

    department: {
      type: String,
      enum: Object.keys(ROLE_MAP),
      required: true,
    },

    role: {
      type: String,
      required: true,
    },

    // 🔹 PROFILE
    photo: {
      type: String,
      default: null,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
    },

    // 🔹 STATUS
    status: {
      type: String,
      enum: ["Present", "Absent", "On Leave"],
      default: "Present",
    },

    shift: {
      type: String,
      enum: ["Morning", "Evening", "Night"],
    },

    // 🔹 AUTH / SECURITY
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isFirstLogin: {
      type: Boolean,
      default: false,
    },

    // 🔹 OTP
    otp: {
      type: String,
      select: false,
    },

    otpExpiresAt: {
      type: Date,
      select: false,
      index: true,
    },

    otpAttempts: {
      type: Number,
      default: 0,
      select: false,
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

    // 🔐 SINGLE DEVICE LOCK
    deviceId: {
      type: String,
      default: null,
      index: true,
    },

    // 🔹 LOGIN TRACKING
    lastLoginAt: Date,
    lastLoginIP: String,
    lastUserAgent: String,

    // 🔹 ATTENDANCE
    lastAttendanceAt: Date,

    // 📍 LOCATION LOCK
    allowedLocation: {
      lat: Number,
      lng: Number,
      radius: {
        type: Number,
        default: 100,
      },
    },

    // 🔹 SOFT DELETE
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// 🔥 INDEXES (SAFE — no duplicate)
staffSchema.index({ department: 1, role: 1 });
staffSchema.index({ isActive: 1, isDeleted: 1 });

module.exports = mongoose.model("Staff", staffSchema);