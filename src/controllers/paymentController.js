const razorpay = require("../config/razorpay");
const crypto = require("crypto");
const Order = require("../models/User/ordersModel");
const Payment = require("../models/paymentModel");
const Address = require("../models/User/address");

exports.createOrder = async (req, res, next) => {
  try {
    const { items, addressId, noContact, total } = req.body;
    // console.log("$$ USER DATA", req.body.total);
    const userId = req.user.id;
    // console.log("$$$ userID ",userId)

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
    console.log(address);

    if (
      !address ||
      !address.user ||
      address.user?.toString() !== userId?.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Invalid delivery address",
      });
    }

    // Calculate totalAmount from items

    const updatedItems = items.map((item) => ({
      ...item,
      total: item.price * item.quantity,
    }));

    const totalAmount = total;

    const newOrder = new Order({
      user: userId,
      items: updatedItems,
      address: address,
      noContact: noContact || false,
      paymentStatus: "pending",
      orderStatus: "confirmed",
      totalAmount,
    });
    let savedOrder;
    try {
      savedOrder = await newOrder.save();
      console.log("$$$ order saved");
    } catch (error) {
      console.log("$$$ Error", error);
      return;
    }
    let razorpayOrder;
    // Create Razorpay order
    try {
      console.log("Amount", totalAmount);
      razorpayOrder = await razorpay.orders.create({
        amount: totalAmount * 100,
        currency: "INR",
        receipt: `receipt_${savedOrder._id}_${new Date().getDate()}`,
      });
    } catch (error) {
      console.dir("$$$ Razorpay error", error);
      return;
    }

    // Save payment info
    const payment = await Payment.create({
      userId,
      orderId: savedOrder._id,
      razorpayOrderId: razorpayOrder.id,
      amount: totalAmount,
      receipt: razorpayOrder.receipt,
      status: "created",
    });

    console.log("$$$ payment saved", payment);

    res.status(201).json({
      success: true,
      message: "Order created successfully. Proceed with payment.",
      data: savedOrder,
      razorpayOrder,
    });
  } catch (err) {
    next(err);
  }
};


exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

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
        },
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

    let captured;

    try {
      captured = await razorpay.payments.capture(
        razorpay_payment_id,
        payment.amount * 100,
      );
    } catch (err) {
      if (
        err.error &&
        err.error.description === "This payment has already been captured"
      ) {
        captured = { status: "captured" };
      } else {
        throw err;
      }
    }

    if (captured) {
      await Payment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        {
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          paymentMethod: captured.method || "unknown",
          razorpayStatus: captured.status,
          status: "captured",
          isCaptured: true,
        },
      );
    }

   await Order.findByIdAndUpdate(payment.orderId, {
  "payment.status": "paid",
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
      },
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
