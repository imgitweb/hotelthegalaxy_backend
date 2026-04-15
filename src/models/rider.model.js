const mongoose = require("mongoose");

const riderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: Number,
      required: true,
      unique: true,
    },
    vehicleNumber: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    // ADDED: Track if password was set by user or is just a temporary hash
    isPasswordSet: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["Available", "On-Trip", "Offline","Not-Arrived"],
      default: "Not-Arrived",
    },
    role: {
      type: String,
      enum: ["RIDER"],
      default: "RIDER",
    },
    currentTripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    otp: {
      type: String,
      select: false,
    },
    otpExpiresAt: {
      type: Date,
    },
    otpAttempts: {
      type: Number,
      default: 0,
    },
    otpLastRequestedAt: {
      type: Date,
    },
    otpRequestCount: {
      type: Number,
      default: 0,
    },
    otpRequestWindowStartedAt: {
      type: Date,
    },
    ratingAverage: {
      type: Number,
      default: 0,
    },
    totalRatings: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Rider", riderSchema);