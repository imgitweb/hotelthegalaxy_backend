const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'role' 
    },

    role: {
      type: String,
      enum: ["Staff", "Rider"],
      required: true
    },

    date: {
      type: String,
      required: true,
    },

    checkInTime: {
      type: Date,
      default: Date.now,
    },

    checkOutTime: {
      type: Date,
      default: null,
    },

    photo: {
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
      enum: ["Present", "Late", "Absent"],
      default: "Present",
    },

    // ✅ NEW: Array to track exact times of Online/Offline toggles
    dutyLogs: [
      {
        action: { 
          type: String, 
          enum: ["CheckIn", "Available", "Offline", "CheckOut"],
          required: true 
        },
        time: { 
          type: Date, 
          default: Date.now 
        }
      }
    ]
  },
  { timestamps: true }
);

// Ensure one record per USER per day
attendanceSchema.index({ staffId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });

const attendance = mongoose.model("Attendance", attendanceSchema);
module.exports = { attendance };





// const mongoose = require("mongoose");

// const attendanceSchema = new mongoose.Schema(
//   {
//     staffId: {
//       type: mongoose.Schema.Types.ObjectId,
//       required: true,
//       // dynamically decide reference: Staff or Rider
//       refPath: 'role' 
//     },

//     role: {
//       type: String,
//       enum: ["Staff", "Rider"],
//       required: true
//     },

//     date: {
//       type: String,
//       required: true,
//     },

//     checkInTime: {
//       type: Date,
//       default: Date.now,
//     },

//     checkOutTime: {
//       type: Date,
//       default: null,
//     },

//     photo: {
//       type: String,
//     },

//     deviceId: {
//       type: String,
//     },

//     location: {
//       lat: Number,
//       lng: Number,
//     },

//     status: {
//       type: String,
//       enum: ["Present", "Late", "Absent"],
//       default: "Present",
//     },
//   },
//   { timestamps: true }
// );

// // Ensure one record per USER per day
// attendanceSchema.index({ staffId: 1, date: 1 }, { unique: true });
// attendanceSchema.index({ date: 1 });

// const attendance = mongoose.model("Attendance", attendanceSchema);
// module.exports = { attendance };