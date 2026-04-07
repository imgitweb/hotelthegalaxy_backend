const mongoose = require("mongoose");

const tripSchema = new mongoose.Schema(
  {
    tripId: {
      type: String,
      unique: true,
      required: true,
    },
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      required: true,
    },
    orderIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Orders",
      },
    ],
    status: {
      type: String,
      enum: ["Pending", "Active", "Completed", "Cancelled"],
      default: "Active",
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
    },
    totalDistance: {
      type: Number, // in km
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    deliveredCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
    orderOtps: {
      type: Map,
      of: String,
    },
    notes: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Trip", tripSchema);