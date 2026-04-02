const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Orders",
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
      default: "RAZORPAY",
    },
    transactionId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED", "REFUNDED"],
      default: "PENDING",
      index: true,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Payment || mongoose.model("Payment", paymentSchema);