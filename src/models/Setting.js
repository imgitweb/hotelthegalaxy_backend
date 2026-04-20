const mongoose = require("mongoose");

const deliverySettingSchema = new mongoose.Schema(
  {
    // 📍 Max delivery range (admin control)
    maxDeliveryDistance: {
      type: Number,
      default: 6, // default 6 KM
      required: true,
    },

    // 💰 Delivery charge settings
    deliveryCharge: {
      isFreeDelivery: {
        type: Boolean,
        default: false, // toggle button
      },

      baseDistance: {
        type: Number,
        default: 5, // e.g. 5 KM tak fixed charge
      },

      baseFee: {
        type: Number,
        default: 30, // e.g. ₹30 for first 5 KM
      },

      extraPerKmRate: {
        type: Number,
        default: 10, // after baseDistance
      },

      minCharge: {
        type: Number,
        default: 20,
      },

      maxCharge: {
        type: Number,
        default: 200,
      },

      freeDeliveryAbove: {
      type: Number,
      default: 500,
    },

    
    },

    // 🧾 GST settings
    gst: {
      foodGSTPercent: {
        type: Number,
        default: 5, // Food GST (India standard)
      },
      deliveryGSTPercent: {
        type: Number,
        default: 5,
      },
    },

    // 🎯 Optional: Free delivery above order value
    
  },
  { timestamps: true }
);

module.exports = mongoose.model("DeliverySetting", deliverySettingSchema);