const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      index: true,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    checkInTime: {
      type: Date,
    },

    checkOutTime: {
      type: Date,
    },

    checkInPhoto: {
      type: String,
    },

    checkOutPhoto: {
      type: String,
    },

    deviceId: {
      type: String,
    },

    location: {
      lat: Number,
      lng: Number,
    },

    status: {
      type: String,
      enum: ["Present", "Absent", "Late"],
      default: "Present",
    },

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// prevent duplicate attendance per day
attendanceSchema.index({ staff: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);