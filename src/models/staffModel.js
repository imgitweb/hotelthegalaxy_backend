const ROLE_MAP = require("../config/roleMap");
const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true, 
    },
 department: {
  type: String,
  required: true,
  trim: true,
},

role: {
  type: String,
  required: true,
},
    photo: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    
  
    status: {
      type: String,
      enum: ["Present", "Absent", "On Leave", "Available", "Offline"],
      default: "Present",
    },

    shift: {
      type: String,
      enum: ["Morning", "Evening", "Night"],
    },
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
    password: { type: String, select: false },
    otp: { type: String, select: false },
    otpExpiresAt: { type: Date, select: false, index: true },
    otpAttempts: { type: Number, default: 0, select: false },
    otpLastRequestedAt: { type: Date, select: false },
    otpRequestCount: { type: Number, default: 0, select: false },
    faceEmbedding: { type: [Number], select: false },
    otpRequestWindowStartedAt: { type: Date, select: false },
    deviceId: { type: String, default: null, index: true },
    lastLoginAt: Date,
    lastLoginIP: String,
    lastUserAgent: String,
    lastAttendanceAt: Date,
    allowedLocation: {
      lat: Number,
      lng: Number,
      radius: { type: Number, default: 100 },
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

staffSchema.index({ department: 1, role: 1 });
staffSchema.index({ isActive: 1, isDeleted: 1 });

module.exports = mongoose.model("Staff", staffSchema);