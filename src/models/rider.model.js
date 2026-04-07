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
    status: {
      type: String,
      enum: ["Available", "On-Trip", "Offline"],
      default: "Available",
    },

    currentTripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip", 
      default: null
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