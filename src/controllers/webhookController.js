const razorpay = require("../config/razorpay");
const crypto = require("crypto");
const Order = require("../models/User/ordersModel");
const Payment = require("../models/paymentModel");
const Address = require("../models/User/address");

exports.handleWebhook = async (req, res, next) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    
    // Secret ko environment variable mein rakhna best practice hai
    // .env file mein RAZORPAY_WEBHOOK_SECRET=qwertyuiop123 add karein
    const WEBHOOK_SECRET = 'qwertyuiop123';

    // 1. Validate Signature
    const isValid = validateWebhookSignature(
      JSON.stringify(req.body),
      webhookSignature,
      WEBHOOK_SECRET
    );

    if (!isValid) {
      console.log('❌ Invalid webhook signature!');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    console.log('✅ Webhook verified successfully!');

    const eventType = req.body.event;
    
    // Razorpay ki taraf se bheja gaya data
    const paymentData = req.body.payload.payment.entity; 
    const razorpayOrderId = paymentData.order_id; // Yeh hamare DB se link karne ke kaam aayega

    // 2. Handle Events
    if (eventType === 'payment.captured') {
      console.log(`Payment captured via Webhook for order: ${razorpayOrderId}`);
      
      // Database mein Payment dhundhein
      const payment = await Payment.findOne({ razorpayOrderId: razorpayOrderId });

      if (payment && !payment.isCaptured) {
        // Payment table update karein
        await Payment.findOneAndUpdate(
          { razorpayOrderId: razorpayOrderId },
          {
            razorpayPaymentId: paymentData.id,
            paymentMethod: paymentData.method || "unknown",
            razorpayStatus: paymentData.status,
            status: "captured",
            isCaptured: true,
          }
        );

        // Order table update karein (Aapke schema ke hisaab se keys adjust kar lein)
        await Order.findByIdAndUpdate(payment.orderId, {
          paymentStatus: "paid", // Ya "payment.status": "paid" (jaise verifyPayment mein hai)
        });
      }
    } 
    else if (eventType === 'payment.failed') {
      console.log(`Payment failed via Webhook for order: ${razorpayOrderId}`);
      
      const payment = await Payment.findOne({ razorpayOrderId: razorpayOrderId });

      if (payment) {
        await Payment.findOneAndUpdate(
          { razorpayOrderId: razorpayOrderId },
          {
            status: "failed",
            failureReason: paymentData.error_description || "Payment failed via webhook",
          }
        );

        await Order.findByIdAndUpdate(payment.orderId, {
          paymentStatus: "failed",
        });
      }
    }

    // 3. Razorpay ko Success Response bhejna ZAROORI hai
    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('Webhook processing error:', error);
    // Error aane par bhi Razorpay ko 500 bhejte hain taaki wo baad mein retry kare
    return res.status(500).json({ error: 'Internal server error' }); 
  }
};