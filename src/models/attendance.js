const mongoose = require("mongoose");

const dutyLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["CheckIn", "CheckOut", "Available", "Offline"],
      required: true,
    },
    time: { type: Date, required: true },
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
      required: true,
    },

 
    shiftDate: {
      type: String,
      required: true,
    },

    
    date: {
      type: String,
      required: true,
    },
    checkInTime: { type: Date, required: true },
    checkOutTime: { type: Date, default: null },
    
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
attendanceSchema.index(
  { staffId: 1, shiftDate: 1, shift: 1 },
  { unique: true }
);

const attendance = mongoose.model("Attendance", attendanceSchema);
module.exports = { attendance };