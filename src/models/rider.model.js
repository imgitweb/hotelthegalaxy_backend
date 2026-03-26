const mongoose = require("mongoose");

const riderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },

    email: {
      type: String,
      lowercase: true,
    },

    vehicleType: {
      type: String,
      enum: ["bike", "scooter", "cycle"],
    },

    vehicleNumber: {
      type: String,
    },

    zone: {
      type: String,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    ratingAverage: {
      type: Number,
      default: 0,
    },

    totalRatings: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Rider", riderSchema);
