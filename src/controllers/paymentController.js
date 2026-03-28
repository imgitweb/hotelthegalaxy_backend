const razorpay = require("../config/razorpay");
const crypto = require("crypto");
const Order = require("../models/User/ordersModel");
const Payment = require("../models/paymentModel");


exports.createOrder = async (req, res, next) => {
  try {
    const { localOrderId } = req.body;

    const orderData = await Order.findById(localOrderId);
    if (!orderData) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (orderData.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const existingPayment = await Payment.findOne({
      orderId: localOrderId,
    });

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message: "Payment already initiated",
      });
    }

    const amount = orderData.totalAmount;

    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    await Payment.create({
      userId: req.user._id,
      orderId: localOrderId,
      razorpayOrderId: razorpayOrder.id,
      amount,
      receipt: options.receipt,
      status: "created",
    });

    res.status(200).json({
      success: true,
      order: razorpayOrder,
    });
  } catch (err) {
    next(err);
  }
};

exports.verifyPayment = async (req, res, next) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await Payment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        {
          status: "failed",
          failureReason: "Invalid Signature",
        }
      );

      return res.status(400).json({
        success: false,
        message: "Invalid signature",
      });
    }

    const payment = await Payment.findOne({
      razorpayOrderId: razorpay_order_id,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    if (payment.isCaptured || payment.status === "captured") {
      return res.status(200).json({
        success: true,
        message: "Already captured",
      });
    }

    const captured = await razorpay.payments.capture(
      razorpay_payment_id,
      payment.amount * 100
    );

    await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paymentMethod: captured.method || "unknown",
        razorpayStatus: captured.status,
        status: "captured",
        isCaptured: true,
      }
    );

    await Order.findByIdAndUpdate(payment.orderId, {
      paymentStatus: "paid",
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified & captured",
    });
  } catch (err) {
    next(err);
  }
};

exports.handleCancel = async (req, res, next) => {
  try {
    const { razorpay_order_id, reason } = req.body;

    const payment = await Payment.findOne({
      razorpayOrderId: razorpay_order_id,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    if (payment.isCaptured) {
      return res.status(400).json({
        success: false,
        message: "Payment already completed",
      });
    }

    await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        status: "failed",
        failureReason: reason || "User cancelled payment",
      }
    );

    await Order.findByIdAndUpdate(payment.orderId, {
      paymentStatus: "failed",
    });

    res.status(200).json({
      success: true,
      message: "Payment marked as failed",
    });
  } catch (err) {
    next(err);
  }
};