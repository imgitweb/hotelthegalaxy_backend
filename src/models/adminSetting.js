const mongoose = require("mongoose");
const settingsSchema = new mongoose.Schema(
  {
    hotelName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    location: { type: String },
    description: { type: String },
    avatar: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("adminSetting", settingsSchema);