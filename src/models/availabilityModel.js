const mongoose = require("mongoose");

const availabilitySchema = new mongoose.Schema(
  {
    isOrderingEnabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    kitchenStartTime: {
      type: String,
      required: true,
      default: "09:00",
    },
    kitchenEndTime: {
      type: String,
      required: true,
      default: "23:00",
    },
    isTemporarilyClosed: {
      type: Boolean,
      default: false,
    },
    reason: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Availability", availabilitySchema);