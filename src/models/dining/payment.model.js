const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    gateway: {
      type: String,
      enum: ["RAZORPAY", "STRIPE", "CASH", "UPI"],
    },

    transactionId: String,

    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED", "REFUNDED"],
      default: "PENDING",
      index: true,
    },

    metadata: Object,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Payment", paymentSchema);
