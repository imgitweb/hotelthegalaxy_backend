const mongoose = require("mongoose");

const deliverySettingSchema = new mongoose.Schema(
  {
    baseFee: { type: Number, required: true, default: 30 },
    baseDistance: { type: Number, required: true, default: 3 }, // Naya field (e.g., up to 3 KM)
    perKmRate: { type: Number, required: true, default: 10 },
    minCharge: { type: Number, required: true, default: 20 },
    maxCharge: { type: Number, required: true, default: 200 },
    freeDeliveryAbove: { type: Number, required: true, default: 500 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DeliverySetting", deliverySettingSchema);