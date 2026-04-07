const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    discount: { type: Number, required: true },
    originalPrice: { type: Number, required: true },
    type: { type: String, enum: ["room", "suite", "dining"], required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    validFrom: { type: Date },
    validTo: { type: Date },
    description: String,
    bookings: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    image: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("OfferRooms", offerSchema);