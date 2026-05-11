const mongoose = require("mongoose");

const dutyLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["CheckIn", "CheckOut", "Available", "Offline"],
      required: true,
    },
    time: { type: Date, required: true },
    source: { 
      type: String, 
      enum: ["manual", "geo", "system"], 
      default: "system" 
    } // Added to track who triggered the log
  },
  { _id: false }
);


const attendanceSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    role: {
      type: String,
      enum: ["Staff", "Rider"],
      required: true,
    },
    shift: {
      type: String,
      enum: ["Day", "Night"],
    },
    shiftDate: {
      type: String,
    },
    date: {
      type: String,
      required: true,
    },
    shiftStart: { type: Date, required: true }, // MISSING IN YOUR CODE, ADDED NOW
    checkInTime: { type: Date, required: true },
    checkOutTime: { type: Date, default: null },
    forcedCheckout: { type: Boolean, default: false }, // TRACKS IF AUTO-CLOSED TO 12H
    
    location: {
      lat: { type: Number },
      lng: { type: Number },
    },
    photo: { type: String },
    deviceId: { type: String, default: "unknown" },
    status: {
      type: String,
      enum: ["Present", "Absent", "Leave"],
      default: "Present",
    },
    dutyLogs: [dutyLogSchema],
  },
  { timestamps: true }
);


// Allow only one check-in per day per staff
attendanceSchema.index(
  { staffId: 1, date: 1 },
  { unique: true }
);

const attendance = mongoose.model("Attendance", attendanceSchema);
module.exports = { attendance };