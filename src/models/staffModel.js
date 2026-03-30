const ROLE_MAP = require("../config/roleMap");
const mongoose = require("mongoose");
const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },

    department: {
      type: String,
      enum: Object.keys(ROLE_MAP),
      required: true,
    },

    role: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["Active", "Offline", "On Leave"],
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