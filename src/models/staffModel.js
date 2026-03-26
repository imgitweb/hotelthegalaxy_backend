const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    role: {
      type: String,
      enum: ["Head Chef", "Assistant Chef", "Helper", "Cleaner"],
      required: true,
    },
    status: {
      type: String,
      enum: ["Active", "Offline"],
      default: "Offline",
    },
    shift: {
      type: String,
      enum: ["Morning", "Evening", "Night"],
    },
    experience: Number,
    salary: Number,
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Staff", staffSchema);