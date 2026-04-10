const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },

    date: {
      type: String, // 🔥 use string (YYYY-MM-DD)
      required: true,
    },

    checkInTime: Date,

    checkInPhoto: String,

    deviceId: String,

    location: {
      lat: Number,
      lng: Number,
    },

    status: {
      type: String,
      default: "Present",
    },
  },
  { timestamps: true }
);

attendanceSchema.index({ staff: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);