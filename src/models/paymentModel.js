const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order ID is required"],
      index: true,
    },

    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
    },

    razorpayPaymentId: {
      type: String,
      default: null,
      index: true,
    },

    razorpaySignature: {
      type: String,
      default: null,
    },

    amount: {
      type: Number,
      required: true,
      min: [1, "Amount must be greater than 0"],
    },

    currency: {
      type: String,
      default: "INR",
    },

    status: {
      type: String,
      enum: ["created", "captured", "failed", "cancelled", "refunded"],
      default: "created",
      index: true,
    },

    isCaptured: {
      type: Boolean,
      default: false,
    },

    paymentMethod: {
      type: String,
      enum: ["card", "upi", "netbanking", "wallet", "emi", "unknown"],
      default: "unknown",
    },

    razorpayStatus: {
      type: String,
      default: null,
    },

    receipt: {
      type: String,
      default: null,
    },

    failureReason: {
      type: String,
      default: null,
    },

    refunds: [
      {
        refundId: String,
        amount: Number,
        status: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = Payment;