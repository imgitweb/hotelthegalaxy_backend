const razorpay = require("../config/razorpay");
const crypto = require("crypto");
const Order = require("../models/User/ordersModel");
const Payment = require("../models/paymentModel");
const Address = require("../models/User/address");

exports.createOrder = async (req, res, next) => {
  try {
    const { items, addressId, noContact, total } = req.body;
    const userId = req.userId;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order must contain at least one item",
      });
    }

    if (!addressId) {
      return res.status(400).json({
        success: false,
        message: "Delivery address is required",
      });
    }

    const address = await Address.findById(addressId);

    if (!address || address.user?.toString() !== userId?.toString()) {
      return res.status(403).json({
        success: false,
        message: "Invalid delivery address",
      });
    }

    if (!total || total <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid total amount",
      });
    }
 
    const updatedItems = items.map((item) => ({
      ...item,
      total: item.price * item.quantity,
    }));
 
    const newOrder = new Order({
      orderNumber: "ORD-" + Date.now(),
      user: userId,
      items: updatedItems,
      address: {
        street: address.street,
        landmark: address.landmark,
        lat: address.lat,
        lng: address.lng,
        location: address.location,
      },
      pricing: {
        total,
      },
      noContact: noContact || false,
      status: "pending",
      payment: {
        status: "pending",
      },
    });

    const savedOrder = await newOrder.save();
 
    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create({
        amount: Math.round(total) * 100, // paise mein
        currency: "INR",
        receipt: `receipt_${savedOrder._id}`,
      });
    } catch (err) {
      await Order.findByIdAndDelete(savedOrder._id);
      console.error("Razorpay order creation failed:", err);
      return res.status(502).json({
        success: false,
        message: "Payment gateway error. Please try again.",
      });
    }

    await Payment.create({
      order: savedOrder._id,
      amount: total,
      gateway: "RAZORPAY",
      status: "PENDING",
      metadata: {
        razorpayOrderId: razorpayOrder.id,
        receipt: razorpayOrder.receipt,
      },
    });

    res.status(201).json({
      success: true,
      message: "Order created successfully. Proceed with payment.",
      data: savedOrder,
      razorpayOrder,
    });
  } catch (err) {
    console.error("Create Order Error:", err.message);
    next(err);
  }
};

exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing payment verification fields",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await Payment.findOneAndUpdate(
        { "metadata.razorpayOrderId": razorpay_order_id },
        {
          status: "FAILED",
          "metadata.failureReason": "Invalid signature",
        },
      );

      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    const payment = await Payment.findOne({
      "metadata.razorpayOrderId": razorpay_order_id,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    if (payment.status === "SUCCESS") {
      return res.status(200).json({
        success: true,
        message: "Payment already captured",
      });
    }

    let captured;
    try {
      captured = await razorpay.payments.capture(
        razorpay_payment_id,
        Math.round(payment.amount) * 100,
      );
    } catch (err) {
      if (
        err.error &&
        err.error.description === "This payment has already been captured"
      ) {
        captured = { status: "captured", method: "unknown" };
      } else {
        console.error("Razorpay capture error:", err);
        return next(err);
      }
    }

    await Payment.findByIdAndUpdate(payment._id, {
      status: "SUCCESS",
      transactionId: razorpay_payment_id,
      "metadata.razorpayPaymentId": razorpay_payment_id,
      "metadata.razorpaySignature": razorpay_signature,
      "metadata.paymentMethod": captured.method || "unknown",
      "metadata.razorpayStatus": captured.status,
    });

    await Order.findByIdAndUpdate(payment.order, {
      "payment.status": "paid",
      "payment.transactionId": razorpay_payment_id,
      "payment.method": captured.method || "razorpay",
      status: "confirmed",
      "timeline.confirmedAt": new Date(),
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified and captured successfully",
    });
  } catch (err) {
    console.error("Verify Payment Error:", err.message);
    next(err);
  }
};

exports.handleCancel = async (req, res, next) => {
  try {
    const { razorpay_order_id, reason } = req.body;

    if (!razorpay_order_id) {
      return res.status(400).json({
        success: false,
        message: "razorpay_order_id is required",
      });
    }
    const payment = await Payment.findOne({
      "metadata.razorpayOrderId": razorpay_order_id,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    if (payment.status === "SUCCESS") {
      return res.status(400).json({
        success: false,
        message: "Payment already completed, cannot mark as failed",
      });
    }

    await Payment.findByIdAndUpdate(payment._id, {
      status: "FAILED",
      "metadata.failureReason": reason || "User cancelled payment",
    });
    await Order.findByIdAndUpdate(payment.order, {
      "payment.status": "failed",
    });

    res.status(200).json({
      success: true,
      message: "Payment marked as failed",
    });
  } catch (err) {
    console.error("Handle Cancel Error:", err.message);
    next(err);
  }
};