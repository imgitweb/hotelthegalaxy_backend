const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    // Frontend/Controller के अनुसार इसका नाम 'staffId' होना चाहिए
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },

    // दिन में एक बार अटेंडेंस के लिए इसे String (YYYY-MM-DD) में रखा है
    date: {
      type: String, 
      required: true,
    },

    checkInTime: {
      type: Date,
      default: Date.now,
    },

    // इमेज का पाथ सेव करने के लिए 'photo'
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
      default: "Present",
    },
  },
  { timestamps: true }
);


attendanceSchema.index({ staffId: 1, date: 1 }, { unique: true });


const attendance = mongoose.model("Attendance", attendanceSchema);
module.exports = { attendance };