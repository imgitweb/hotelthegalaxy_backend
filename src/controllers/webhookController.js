const crypto = require("crypto");
const Order = require("../models/User/ordersModel");
const Payment = require("../models/paymentModel");

exports.handleWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    if (!signature) {
      return res.status(400).json({ success: false, message: "No signature" });
    }

    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.body)
      .digest("hex");

    if (expectedSig !== signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    const body = JSON.parse(req.body);
    const event = body.event;
    const payload = body.payload;

    if (event === "payment.captured") {
      const rzpPaymentId = payload.payment.entity.id;
      const rzpOrderId = payload.payment.entity.order_id;
      const method = payload.payment.entity.method;

      const payment = await Payment.findOne({
        "metadata.razorpayOrderId": rzpOrderId,
      });

      if (!payment) return res.status(200).json({ received: true });

      if (payment.status !== "SUCCESS") {
        await Payment.findByIdAndUpdate(payment._id, {
          status: "SUCCESS",
          transactionId: rzpPaymentId,
          "metadata.razorpayPaymentId": rzpPaymentId,
          "metadata.paymentMethod": method,
        });

        await Order.findByIdAndUpdate(payment.order, {
          "payment.status": "paid",
          "payment.transactionId": rzpPaymentId,
          "payment.method": method,
          status: "confirmed",
          "timeline.confirmedAt": new Date(),
        });
      }
    }

    if (event === "payment.failed") {
      const rzpOrderId = payload.payment.entity.order_id;
      const errorDesc = payload.payment.entity.error_description;

      const payment = await Payment.findOne({
        "metadata.razorpayOrderId": rzpOrderId,
      });

      if (payment && payment.status === "PENDING") {
        await Payment.findByIdAndUpdate(payment._id, {
          status: "FAILED",
          "metadata.failureReason": errorDesc,
        });

        await Order.findByIdAndUpdate(payment.order, {
          "payment.status": "failed",
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(200).json({ received: true });
  }
};