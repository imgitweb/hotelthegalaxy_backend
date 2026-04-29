require("dotenv").config(); 
const razorpay = require("../config/razorpay");
const { getIO } = require("../config/socket");
const User = require('../models/User');
const crypto = require("crypto");
const Order = require("../models/User/ordersModel");
const Payment = require("../models/paymentModel");
const Address = require("../models/User/address");
const { sendTextMessage, sendInteractiveMessage } = require("../langraph/services/whatsappService");
const { generateOTP, hashOTP } = require("../utils/otp");
const { sendAuthTemplate } = require("../utils/whatsaap/sendAuthTemplate");


const  CouponUsage =  require("../models/couponUsageModel.js");
const Coupon =  require("../models/couponModel.js")


exports.createOrder = async (req, res, next) => {
  try {
    const { items, addressId, noContact, total, couponCode ,couponDiscount = 0 } = req.body;
    console.log("this is order data ", req.body);
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

    // 1. User fetch karein mobile number ke liye
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Last 4 digits extract karna
    const mobileString = (user.phone || user.mobile || "0000").toString();
    const lastFourDigits = mobileString.slice(-4).padStart(4, "0");

    // 2. Sirf IS USER ke WEB orders count karna
    // $regex: '^ORD-Web-' ensure karta hai ki agar usne WhatsApp se order kiya ho to wo isme count na ho
    const userWebOrderCount = await Order.countDocuments({
      user: userId,
      orderNumber: { $regex: '^ORD-Web-' } 
    });
    
    // User ke order count mein +1 karke 4 digits ka sequence banana
    const sequenceNumber = (userWebOrderCount + 1).toString().padStart(4, "0");

    // 3. Final Order Number banana
    const generatedOrderNumber = `ORD-Web-${lastFourDigits}-${sequenceNumber}`;

    const updatedItems = items.map((item) => ({
      ...item,
      total: item.price * item.quantity,
    }));

    const newOrder = new Order({
      orderNumber: generatedOrderNumber, // "ORD-Web-5563-0001" format
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

   const couponDoc = await Coupon.findOne({ code: couponCode });

console.log("Coupon Code:", couponCode);
console.log("Coupon Doc:", couponDoc);

if (couponDoc && couponCode) {
  const usage = await CouponUsage.create({
    coupon: couponDoc._id,
    user: userId,
    orderId: savedOrder._id, // ✅ FIXED
    discountApplied: couponDiscount,
  });

  console.log("CouponUsage Saved:", usage);
} else {
  console.log("Coupon NOT FOUND ❌");
}

 
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
    console.log("🔥 VERIFY PAYMENT HIT");

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    console.log("📥 Incoming:", {
      razorpay_order_id,
      razorpay_payment_id,
    });

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.log("❌ Missing fields");
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
      console.log("❌ Invalid signature");

      await Payment.findOneAndUpdate(
        { "metadata.razorpayOrderId": razorpay_order_id },
        { status: "FAILED" }
      );

      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    console.log("✅ Signature verified");

    const payment = await Payment.findOne({
      "metadata.razorpayOrderId": razorpay_order_id,
    });

    if (!payment) {
      console.log("❌ Payment not found");
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    console.log("💰 Payment status:", payment.status);

    let captured;
    try {
      captured = await razorpay.payments.capture(
        razorpay_payment_id,
        Math.round(payment.amount) * 100
      );
      console.log("✅ Payment captured:", captured.status);
    } catch (err) {
      console.log("⚠️ Already captured or error:", err.message);
      captured = { status: "captured", method: "unknown" };
    }

    // ✅ UPDATE PAYMENT
    await Payment.findByIdAndUpdate(payment._id, {
      status: "SUCCESS",
      transactionId: razorpay_payment_id,
    });

    console.log("✅ Payment DB updated");

    // ✅ GET ORDER (IMPORTANT FIX)
    const updatedOrder = await Order.findByIdAndUpdate(
      payment.order,
      {
        "payment.status": "paid",
        "payment.transactionId": razorpay_payment_id,
        "payment.method": captured.method || "razorpay",
        status: "confirmed",
        "timeline.confirmedAt": new Date(),
      },
      { returnDocument: 'after' } 
    );

    console.log("📦 ORDER:", updatedOrder?._id);

    if (!updatedOrder) {
      console.log("❌ Order not found");
      return res.status(200).json({ success: true });
    }

    // 🛠️ FIXED: GENERATE OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = hashOTP(otp); // Use your actual hashing function here

    updatedOrder.deliveryOTP = {
      code: hashedOtp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes expiry
      verified: false,
      attempts: 0,
    };

    await updatedOrder.save();

    console.log("🔐 DELIVERY OTP GENERATED:", otp);

    // ============================
    // ⚡ WEBSOCKET EMIT (VERIFY PAYMENT)
    // ============================
    try {
      const io = getIO();
      // Emit to specific user in order room
      io.to(updatedOrder._id.toString()).emit("payment_success", {
        success: true,
        orderId: updatedOrder._id,
        status: updatedOrder.status,
        message: "Payment successful & order confirmed",
      });
      
      // Emit to Admin Dashboard
      io.to("admin_room").emit("admin_new_order", {
        order: updatedOrder,
        message: "New order paid and confirmed",
      });
      console.log("⚡ Socket events emitted successfully for verified payment.");
    } catch (socketErr) {
      console.error("⚠️ Socket emit error (Verify Payment):", socketErr.message);
    }

    // 📲 GET PHONE (FINAL FIX)
    const populatedOrder = await Order.findById(updatedOrder._id).populate("user", "phone");

    // 🛠️ FIXED: Extract phone safely without relying on undefined 'user' object
    let userPhone = updatedOrder.address?.phone || populatedOrder.user?.phone;

    console.log("📞 RAW PHONE:", userPhone);

    if (userPhone) {
      userPhone = userPhone.toString().replace(/\D/g, ""); // Remove non-numeric chars

      if (userPhone.length === 10) {
        userPhone = "91" + userPhone; // Add country code if missing
      }

      console.log("📞 FINAL PHONE:", userPhone);

      try {
        // 🛠️ FIXED: Now we send it using the properly extracted userPhone
        const response = await sendAuthTemplate(userPhone, otp);
        console.log("📲 WhatsApp OTP Response:", response);
      } catch (err) {
        console.error("❌ WhatsApp Error:", err.message);
      }
    } else {
      console.log("❌ Phone still not found");
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified + OTP sent",
    });
  } catch (err) {
    console.error("🔥 VERIFY PAYMENT ERROR:", err);
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


exports.handleWebhook = async (req, res) => {
  console.log("🔥 WEBHOOK ROUTE HIT!");

  try {
    const webhookSignature = req.headers["x-razorpay-signature"];
    const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

    const rawBody = req.body.toString("utf8");

    const expectedSignature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== webhookSignature) {
      console.log("❌ Invalid webhook signature!");
      return res.status(400).json({ error: "Invalid signature" });
    }

    console.log("✅ Webhook Signature verified");

    const payload = JSON.parse(rawBody);
    const eventType = payload.event;
    const paymentData = payload.payload.payment.entity;

    const dbOrderId = paymentData.notes?.dbOrderId;

    if (!dbOrderId) {
      console.log("⚠️ No dbOrderId found in Razorpay notes");
      return res.status(200).json({ status: "ok" });
    }

    // ✅ PAYMENT SUCCESS
    if (eventType === "payment.captured" || eventType === "payment_link.paid") {
      console.log("💰 Payment success for:", dbOrderId);

      const payment = await Payment.findOne({ order: dbOrderId });

      if (!payment || payment.status === "SUCCESS") {
        console.log("ℹ️ Payment already processed or not found");
        return res.status(200).json({ status: "ok" });
      }

      // ✅ Update Payment Collection
      await Payment.findByIdAndUpdate(payment._id, {
        status: "SUCCESS",
        transactionId: paymentData.id,
      });

      // 🔐 STRICT 6-DIGIT OTP GENERATION
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedOtp = hashOTP(otp);
      
      console.log("🔐 NEW 6-DIGIT DELIVERY OTP:", otp);

      // ✅ FIX: Update Order AND Delivery OTP in a SINGLE Database Call
      const updatedOrder = await Order.findByIdAndUpdate(
        dbOrderId,
        {
          "payment.status": "paid",
          "payment.transactionId": paymentData.id,
          "payment.method": paymentData.method || "razorpay",
          status: "confirmed",
          "timeline.confirmedAt": new Date(),
          
          // OTP Data direct yahin save kar rahe hain
          "deliveryOTP.code": hashedOtp,
          "deliveryOTP.verified": false,
          "deliveryOTP.attempts": 0,
        },
        { returnDocument: "after" } // 🔥 Fixed Mongoose Deprecation Warning
      ).populate("user", "phone"); 

      console.log("✅ ORDER & OTP UPDATED IN DB:", updatedOrder?._id);

      if (!updatedOrder) {
        console.log("❌ Order not found in database");
        return res.status(200).json({ status: "ok" });
      }

      // ============================
      // ⚡ WEBSOCKET EMIT (WEBHOOK)
      // ============================
      try {
        const io = getIO();
        // Notify the specific user order room
        io.to(updatedOrder._id.toString()).emit("payment_success", {
          success: true,
          orderId: updatedOrder._id,
          status: updatedOrder.status,
          message: "Payment captured successfully via webhook",
        });

        // Notify the admin room
        io.to("admin_room").emit("admin_new_order", {
          order: updatedOrder,
          message: "New order paid and confirmed via webhook",
        });
        console.log("⚡ Socket events emitted successfully for webhook payment.");
      } catch (socketErr) {
        console.error("⚠️ Socket emit error (Webhook):", socketErr.message);
      }

      // 📲 PHONE FORMATTING & EXTRACTION
      let userPhone = paymentData.notes?.phone || updatedOrder.address?.phone || updatedOrder.user?.phone;

      console.log("📞 RAW PHONE:", userPhone);

      if (userPhone) {
        userPhone = userPhone.toString().replace(/\D/g, "");

        if (userPhone.length === 10) {
          userPhone = "91" + userPhone;
        }

        console.log("📞 FINAL PHONE:", userPhone);

        // 🔥 SEND ORDER CONFIRMATION MESSAGE
        const orderNumber = updatedOrder.orderNumber || updatedOrder._id.toString().slice(-6).toUpperCase();

        const msg = `🎉 *Order Confirmed!*\n\n🧾 Order: ${orderNumber}\n\n🔐 OTP: ${otp}\n\n⚠️ Please share this OTP with the delivery partner at the time of delivery.`;

        const interactiveMsg = {
          type: "button",
          body: { text: msg },
          action: {
            buttons: [
              {
                type: "reply",
                reply: { id: "track", title: "📦 Track Order" },
              },
            ],
          },
        };

        try {
          await sendInteractiveMessage(userPhone, interactiveMsg);
          console.log("✅ Order WhatsApp sent to Customer");
        } catch (err) {
          console.error("❌ Order message error:", err.message);
        }
      } else {
        console.log("❌ Phone not found, could not send WhatsApp message");
      }
    }

    // Razorpay requires a 200 OK response quickly
    return res.status(200).json({ status: "ok" });
    
  } catch (error) {
    console.error("🔥 Webhook error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};





// require("dotenv").config(); 
// const razorpay = require("../config/razorpay");
// const { getIO } = require("../config/socket");
// const User = require('../models/User');
// const crypto = require("crypto");
// const Order = require("../models/User/ordersModel");
// const Payment = require("../models/paymentModel");
// const Address = require("../models/User/address");
// const {sendTextMessage , sendInteractiveMessage } = require("../langraph/services/whatsappService")
// const { generateOTP, hashOTP } = require("../utils/otp");
// const { sendAuthTemplate } = require("../utils/whatsaap/sendAuthTemplate");

// // Dhyan dein: Agar User model imported nahi hai, toh is file ke top par import zaroor kar lein.
// // const User = require('../models/User'); // Example import

// exports.createOrder = async (req, res, next) => {
//   try {
//     const { items, addressId, noContact, total } = req.body;
//     const userId = req.userId;

//     if (!items || items.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Order must contain at least one item",
//       });
//     }

//     if (!addressId) {
//       return res.status(400).json({
//         success: false,
//         message: "Delivery address is required",
//       });
//     }

//     const address = await Address.findById(addressId);

//     if (!address || address.user?.toString() !== userId?.toString()) {
//       return res.status(403).json({
//         success: false,
//         message: "Invalid delivery address",
//       });
//     }

//     if (!total || total <= 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid total amount",
//       });
//     }

//     // 1. User fetch karein mobile number ke liye
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     // Last 4 digits extract karna
//     const mobileString = (user.phone || user.mobile || "0000").toString();
//     const lastFourDigits = mobileString.slice(-4).padStart(4, "0");

//     // 2. Sirf IS USER ke WEB orders count karna
//     // $regex: '^ORD-Web-' ensure karta hai ki agar usne WhatsApp se order kiya ho to wo isme count na ho
//     const userWebOrderCount = await Order.countDocuments({
//       user: userId,
//       orderNumber: { $regex: '^ORD-Web-' } 
//     });
    
//     // User ke order count mein +1 karke 4 digits ka sequence banana
//     const sequenceNumber = (userWebOrderCount + 1).toString().padStart(4, "0");

//     // 3. Final Order Number banana
//     const generatedOrderNumber = `ORD-Web-${lastFourDigits}-${sequenceNumber}`;

//     const updatedItems = items.map((item) => ({
//       ...item,
//       total: item.price * item.quantity,
//     }));

//     const newOrder = new Order({
//       orderNumber: generatedOrderNumber, // "ORD-Web-5563-0001" format
//       user: userId,
//       items: updatedItems,
//       address: {
//         street: address.street,
//         landmark: address.landmark,
//         lat: address.lat,
//         lng: address.lng,
//         location: address.location,
//       },
//       pricing: {
//         total,
//       },
//       noContact: noContact || false,
//       status: "pending",
//       payment: {
//         status: "pending",
//       },
//     });

//     const savedOrder = await newOrder.save();

//     let razorpayOrder;
//     try {
//       razorpayOrder = await razorpay.orders.create({
//         amount: Math.round(total) * 100, // paise mein
//         currency: "INR",
//         receipt: `receipt_${savedOrder._id}`,
//       });
//     } catch (err) {
//       await Order.findByIdAndDelete(savedOrder._id);
//       console.error("Razorpay order creation failed:", err);
//       return res.status(502).json({
//         success: false,
//         message: "Payment gateway error. Please try again.",
//       });
//     }

//     await Payment.create({
//       order: savedOrder._id,
//       amount: total,
//       gateway: "RAZORPAY",
//       status: "PENDING",
//       metadata: {
//         razorpayOrderId: razorpayOrder.id,
//         receipt: razorpayOrder.receipt,
//       },
//     });

//     res.status(201).json({
//       success: true,
//       message: "Order created successfully. Proceed with payment.",
//       data: savedOrder,
//       razorpayOrder,
//     });
//   } catch (err) {
//     console.error("Create Order Error:", err.message);
//     next(err);
//   }
// };




// exports.verifyPayment = async (req, res, next) => {
//   try {
//     console.log("🔥 VERIFY PAYMENT HIT");

//     const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

//     console.log("📥 Incoming:", {
//       razorpay_order_id,
//       razorpay_payment_id,
//     });

//     if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
//       console.log("❌ Missing fields");
//       return res.status(400).json({
//         success: false,
//         message: "Missing payment verification fields",
//       });
//     }

//     const expectedSignature = crypto
//       .createHmac("sha256", process.env.KEY_SECRET)
//       .update(`${razorpay_order_id}|${razorpay_payment_id}`)
//       .digest("hex");

//     if (expectedSignature !== razorpay_signature) {
//       console.log("❌ Invalid signature");

//       await Payment.findOneAndUpdate(
//         { "metadata.razorpayOrderId": razorpay_order_id },
//         { status: "FAILED" }
//       );

//       return res.status(400).json({
//         success: false,
//         message: "Invalid payment signature",
//       });
//     }

//     console.log("✅ Signature verified");

//     const payment = await Payment.findOne({
//       "metadata.razorpayOrderId": razorpay_order_id,
//     });

//     if (!payment) {
//       console.log("❌ Payment not found");
//       return res.status(404).json({
//         success: false,
//         message: "Payment record not found",
//       });
//     }

//     console.log("💰 Payment status:", payment.status);

//     let captured;
//     try {
//       captured = await razorpay.payments.capture(
//         razorpay_payment_id,
//         Math.round(payment.amount) * 100
//       );
//       console.log("✅ Payment captured:", captured.status);
//     } catch (err) {
//       console.log("⚠️ Already captured or error:", err.message);
//       captured = { status: "captured", method: "unknown" };
//     }

//     // ✅ UPDATE PAYMENT
//     await Payment.findByIdAndUpdate(payment._id, {
//       status: "SUCCESS",
//       transactionId: razorpay_payment_id,
//     });

//     console.log("✅ Payment DB updated");

//     // ✅ GET ORDER (IMPORTANT FIX)
//     // 🛠️ FIXED: Mongoose warning (new -> returnDocument: 'after')
//     const updatedOrder = await Order.findByIdAndUpdate(
//       payment.order,
//       {
//         "payment.status": "paid",
//         "payment.transactionId": razorpay_payment_id,
//         "payment.method": captured.method || "razorpay",
//         status: "confirmed",
//         "timeline.confirmedAt": new Date(),
//       },
//       { returnDocument: 'after' } 
//     );

//     console.log("📦 ORDER:", updatedOrder?._id);

//     if (!updatedOrder) {
//       console.log("❌ Order not found");
//       return res.status(200).json({ success: true });
//     }

//     // 🛠️ FIXED: GENERATE OTP
//     const otp = Math.floor(100000 + Math.random() * 900000).toString();
//     const hashedOtp = hashOTP(otp); // Use your actual hashing function here

//     updatedOrder.deliveryOTP = {
//       code: hashedOtp,
//       expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes expiry
//       verified: false,
//       attempts: 0,
//     };

//     await updatedOrder.save();

//     console.log("🔐 DELIVERY OTP GENERATED:", otp);

//     // 📲 GET PHONE (FINAL FIX)
//     const populatedOrder = await Order.findById(updatedOrder._id).populate("user", "phone");

//     // 🛠️ FIXED: Extract phone safely without relying on undefined 'user' object
//     let userPhone = updatedOrder.address?.phone || populatedOrder.user?.phone;

//     console.log("📞 RAW PHONE:", userPhone);

//     if (userPhone) {
//       userPhone = userPhone.toString().replace(/\D/g, ""); // Remove non-numeric chars

//       if (userPhone.length === 10) {
//         userPhone = "91" + userPhone; // Add country code if missing
//       }

//       console.log("📞 FINAL PHONE:", userPhone);

//       try {
//         // 🛠️ FIXED: Now we send it using the properly extracted userPhone
//         const response = await sendAuthTemplate(userPhone, otp);
//         console.log("📲 WhatsApp OTP Response:", response);
//       } catch (err) {
//         console.error("❌ WhatsApp Error:", err.message);
//       }
//     } else {
//       console.log("❌ Phone still not found");
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Payment verified + OTP sent",
//     });
//   } catch (err) {
//     console.error("🔥 VERIFY PAYMENT ERROR:", err);
//     next(err);
//   }
// };

// exports.handleCancel = async (req, res, next) => {
//   try {
//     const { razorpay_order_id, reason } = req.body;

//     if (!razorpay_order_id) {
//       return res.status(400).json({
//         success: false,
//         message: "razorpay_order_id is required",
//       });
//     }
//     const payment = await Payment.findOne({
//       "metadata.razorpayOrderId": razorpay_order_id,
//     });

//     if (!payment) {
//       return res.status(404).json({
//         success: false,
//         message: "Payment not found",
//       });
//     }

//     if (payment.status === "SUCCESS") {
//       return res.status(400).json({
//         success: false,
//         message: "Payment already completed, cannot mark as failed",
//       });
//     }

//     await Payment.findByIdAndUpdate(payment._id, {
//       status: "FAILED",
//       "metadata.failureReason": reason || "User cancelled payment",
//     });
//     await Order.findByIdAndUpdate(payment.order, {
//       "payment.status": "failed",
//     });

//     res.status(200).json({
//       success: true,
//       message: "Payment marked as failed",
//     });
//   } catch (err) {
//     console.error("Handle Cancel Error:", err.message);
//     next(err);
//   }
// };

// exports.handleWebhook = async (req, res) => {
//   console.log("🔥 WEBHOOK ROUTE HIT!");

//   try {
//     const webhookSignature = req.headers["x-razorpay-signature"];
//     const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

//     const rawBody = req.body.toString("utf8");

//     const expectedSignature = crypto
//       .createHmac("sha256", WEBHOOK_SECRET)
//       .update(rawBody)
//       .digest("hex");

//     if (expectedSignature !== webhookSignature) {
//       console.log("❌ Invalid webhook signature!");
//       return res.status(400).json({ error: "Invalid signature" });
//     }

//     console.log("✅ Webhook Signature verified");

//     const payload = JSON.parse(rawBody);
//     const eventType = payload.event;
//     const paymentData = payload.payload.payment.entity;

//     const dbOrderId = paymentData.notes?.dbOrderId;

//     if (!dbOrderId) {
//       console.log("⚠️ No dbOrderId found in Razorpay notes");
//       return res.status(200).json({ status: "ok" });
//     }

//     // ✅ PAYMENT SUCCESS
//     if (eventType === "payment.captured" || eventType === "payment_link.paid") {
//       console.log("💰 Payment success for:", dbOrderId);

//       const payment = await Payment.findOne({ order: dbOrderId });

//       if (!payment || payment.status === "SUCCESS") {
//         console.log("ℹ️ Payment already processed or not found");
//         return res.status(200).json({ status: "ok" });
//       }

//       // ✅ Update Payment Collection
//       await Payment.findByIdAndUpdate(payment._id, {
//         status: "SUCCESS",
//         transactionId: paymentData.id,
//       });

//       // 🔐 STRICT 6-DIGIT OTP GENERATION
//       // Ye guarantee karega ki OTP hamesha 6 numbers ka hi hoga (e.g., 835291)
//       const otp = Math.floor(100000 + Math.random() * 900000).toString();
//       const hashedOtp = hashOTP(otp);
      
//       console.log("🔐 NEW 6-DIGIT DELIVERY OTP:", otp);

//       // ✅ FIX: Update Order AND Delivery OTP in a SINGLE Database Call
//       // Isse `.save()` ki zaroorat nahi padegi aur data perfectly save hoga
//       const updatedOrder = await Order.findByIdAndUpdate(
//         dbOrderId,
//         {
//           "payment.status": "paid",
//           "payment.transactionId": paymentData.id,
//           "payment.method": paymentData.method || "razorpay",
//           status: "confirmed",
//           "timeline.confirmedAt": new Date(),
          
//           // OTP Data direct yahin save kar rahe hain
//           "deliveryOTP.code": hashedOtp,
//           "deliveryOTP.expiresAt": new Date(Date.now() + 10 * 60 * 1000), // 10 mins expiry
//           "deliveryOTP.verified": false,
//           "deliveryOTP.attempts": 0,
//         },
//         { returnDocument: "after" } // 🔥 Fixed Mongoose Deprecation Warning
//       ).populate("user", "phone"); // User populate kar liya taaki phone number easily mil jaye

//       console.log("✅ ORDER & OTP UPDATED IN DB:", updatedOrder?._id);

//       if (!updatedOrder) {
//         console.log("❌ Order not found in database");
//         return res.status(200).json({ status: "ok" });
//       }

//       // 📲 PHONE FORMATTING & EXTRACTION
//       let userPhone = paymentData.notes?.phone || updatedOrder.address?.phone || updatedOrder.user?.phone;

//       console.log("📞 RAW PHONE:", userPhone);

//       if (userPhone) {
//         userPhone = userPhone.toString().replace(/\D/g, "");

//         if (userPhone.length === 10) {
//           userPhone = "91" + userPhone;
//         }

//         console.log("📞 FINAL PHONE:", userPhone);

//         // 🔥 SEND OTP TEMPLATE (Uncomment when ready to use)
//         // try {
//         //   const otpRes = await sendAuthTemplate("+" + userPhone, otp);
//         //   console.log("📲 OTP WhatsApp Response:", otpRes);
//         // } catch (err) {
//         //   console.error("❌ OTP send error:", err.message);
//         // }

//         // 🔥 SEND ORDER CONFIRMATION MESSAGE
//         const orderNumber = updatedOrder.orderNumber || updatedOrder._id.toString().slice(-6).toUpperCase();

//         const msg = `🎉 *Order Confirmed!*\n\n🧾 Order: ${orderNumber}\n\n🔐 OTP: ${otp}\n\n⚠️ Delivery ke time rider ko OTP batana hai.`;

//         const interactiveMsg = {
//           type: "button",
//           body: { text: msg },
//           action: {
//             buttons: [
//               {
//                 type: "reply",
//                 reply: { id: "track", title: "📦 Track Order" },
//               },
//             ],
//           },
//         };

//         try {
//           await sendInteractiveMessage(userPhone, interactiveMsg);
//           console.log("✅ Order WhatsApp sent to Customer");
//         } catch (err) {
//           console.error("❌ Order message error:", err.message);
//         }
//       } else {
//         console.log("❌ Phone not found, could not send WhatsApp message");
//       }
//     }

//     // Razorpay requires a 200 OK response quickly
//     return res.status(200).json({ status: "ok" });
    
//   } catch (error) {
//     console.error("🔥 Webhook error:", error);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// };






// exports.handleWebhook = async (req, res) => {
//   console.log("🔥 WEBHOOK ROUTE HIT!"); 

//   try {
//     const webhookSignature = req.headers['x-razorpay-signature'];
//     const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'qwertyuiop123'; // Apni .env se match karna

//     const rawBody = req.body.toString('utf8');

//     const expectedSignature = crypto
//       .createHmac("sha256", WEBHOOK_SECRET)
//       .update(rawBody)
//       .digest("hex");

//     if (expectedSignature !== webhookSignature) {
//       console.log('❌ Invalid webhook signature!');
//       return res.status(400).json({ error: 'Invalid signature' });
//     }

//     console.log('✅ Webhook Signature verified successfully!');

//     const payload = JSON.parse(rawBody);
//     const eventType = payload.event;
    
//     // Razorpay ki taraf se bheja gaya entity data
//     const paymentData = payload.payload.payment.entity; 

//     // 🔥 MAIN FIX: Razorpay Order ID ki jagah hum apne notes se dbOrderId nikalenge
//     const dbOrderId = paymentData.notes ? paymentData.notes.dbOrderId : null;

//     if (!dbOrderId) {
//       console.log("⚠️ Webhook received but no dbOrderId found in notes. Skipping.");
//       return res.status(200).json({ status: 'ok' });
//     }

//     // 4. Handle Events
//     if (eventType === 'payment.captured' || eventType === 'payment_link.paid') {
//       console.log(`💰 Payment captured for MongoDB Order: ${dbOrderId}`);
      
//       // 🔥 Yahan hum apne database ID se payment find kar rahe hain
//       const payment = await Payment.findOne({ order: dbOrderId });

//       if (payment && payment.status !== "SUCCESS") { 
//         // 1. Update Payment Table
//         await Payment.findByIdAndUpdate(payment._id, {
//           status: "SUCCESS",
//           transactionId: paymentData.id,
//           "metadata.razorpayPaymentId": paymentData.id,
//           "metadata.paymentMethod": paymentData.method || "unknown",
//           "metadata.razorpayStatus": paymentData.status,
//         });

//         // 2. Update Order Table (🔥 Yahan { new: true } lagaya taaki updated data return ho)
//         // const updatedOrder = await Order.findByIdAndUpdate(dbOrderId, {
//         //   "payment.status": "paid", 
//         //   "payment.transactionId": paymentData.id,
//         //   "payment.method": paymentData.method || "razorpay",
//         //   status: "confirmed",
//         //   "timeline.confirmedAt": new Date(),
//         // }, { new: true }); 
        
//         console.log(`✅ DATABASE UPDATED: Order ${dbOrderId} is now PAID!`);

//         console.log("update .......................................................................................................", updatedOrder)

//         // 🔥 3. WHATSAPP MESSAGE LOGIC 🔥
//         if (updatedOrder) {
//             // Notes se ya DB se phone number nikalo
//             let userPhone = paymentData.notes?.phone || updatedOrder.address?.phone;
            
//             if (userPhone) {
//                 // WhatsApp API format ke hisaab se number ko format karna
//                 userPhone = userPhone.toString().replace(/\D/g, ''); 
//                 if (userPhone.length === 10) {
//                     userPhone = "91" + userPhone; 
//                 }

//                 const orderNumber = updatedOrder.orderNumber || updatedOrder._id;
//                 const finalAmount = (paymentData.amount / 100) || updatedOrder.pricing?.total || updatedOrder.totalAmount || 0;
                
               
//                 const successMsg = `🎉 *Payment Confirm Ho Gaya!*\n\nAapka order *${orderNumber}* confirm ho gaya hai.\n\n💰 Amount Paid: ₹${finalAmount}\n\nHumare chefs ne aapka Order banana shuru kar diya hai. 👨‍🍳🔥`;
              
//                 const interactiveMsg = {
//                   type: "button",
//                   body: { text: successMsg },
//                   action: {
//                     buttons: [
//                       { type: "reply", reply: { id: "btn_track", title: "📦 Track Order" } },
//                       { type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }
//                     ]
//                   }
//                 };
              
//                 try {
//                   await sendInteractiveMessage(userPhone, interactiveMsg);
//                   console.log(`✅ Success WhatsApp message sent to ${userPhone}`);
//                 } catch (whatsappErr) {
//                   console.error("❌ Failed to send WhatsApp success message:", whatsappErr);
//                 }

//             } else {
//                 console.log("⚠️ Phone number nahi mila, WhatsApp message nahi bheja.");
//             }
//         }

//       } else {
//         console.log(`ℹ️ Payment already marked as SUCCESS or not found.`);
//       }
//     } 
//     else if (eventType === 'payment.failed') {
//       console.log(`❌ Payment failed for MongoDB Order: ${dbOrderId}`);
      
//       const payment = await Payment.findOne({ order: dbOrderId });

//       if (payment) {
//         await Payment.findByIdAndUpdate(payment._id, {
//           status: "FAILED",
//           "metadata.failureReason": paymentData.error_description || "Webhook reported failure",
//         });

//         await Order.findByIdAndUpdate(dbOrderId, {
//           "payment.status": "failed",
//         });
//       }
//     }

//     // 5. Success Response
//     return res.status(200).json({ status: 'ok' });

//   } catch (error) {
//     console.error('Webhook processing error:', error);
//     return res.status(500).json({ error: 'Internal server error' }); 
//   }
// };









// exports.handleWebhook = async (req, res) => {
//   console.log("🔥 WEBHOOK ROUTE HIT!");

//   try {
//     const webhookSignature = req.headers["x-razorpay-signature"];
//     const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

//     const rawBody = req.body.toString("utf8");

//     const expectedSignature = crypto
//       .createHmac("sha256", WEBHOOK_SECRET)
//       .update(rawBody)
//       .digest("hex");

//     if (expectedSignature !== webhookSignature) {
//       console.log("❌ Invalid webhook signature!");
//       return res.status(400).json({ error: "Invalid signature" });
//     }

//     console.log("✅ Webhook Signature verified");

//     const payload = JSON.parse(rawBody);
//     const eventType = payload.event;
//     const paymentData = payload.payload.payment.entity;

//     const dbOrderId = paymentData.notes?.dbOrderId;

//     if (!dbOrderId) {
//       console.log("⚠️ No dbOrderId found");
//       return res.status(200).json({ status: "ok" });
//     }

//     // ✅ PAYMENT SUCCESS
//     if (eventType === "payment.captured" || eventType === "payment_link.paid") {
//       console.log("💰 Payment success for:", dbOrderId);

//       const payment = await Payment.findOne({ order: dbOrderId });

//       if (!payment || payment.status === "SUCCESS") {
//         console.log("ℹ️ Already processed");
//         return res.status(200).json({ status: "ok" });
//       }

//       // ✅ Update Payment
//       await Payment.findByIdAndUpdate(payment._id, {
//         status: "SUCCESS",
//         transactionId: paymentData.id,
//       });

//       // ✅ FIX: GET updatedOrder properly
//       const updatedOrder = await Order.findByIdAndUpdate(
//         dbOrderId,
//         {
//           "payment.status": "paid",
//           "payment.transactionId": paymentData.id,
//           "payment.method": paymentData.method || "razorpay",
//           status: "confirmed",
//           "timeline.confirmedAt": new Date(),
//         },
//         { new: true } // 🔥 MUST
//       );

//       console.log("✅ ORDER UPDATED:", updatedOrder?._id);

//       if (!updatedOrder) {
//         console.log("❌ Order not found");
//         return res.status(200).json({ status: "ok" });
//       }

//       // 🔐 OTP GENERATE
//       const otp = Math.floor(100000 + Math.random() * 900000).toString();;
//       const hashedOtp = hashOTP(otp);

//       updatedOrder.deliveryOTP = {
//         code: hashedOtp,
//         expiresAt: new Date(Date.now() + 10 * 60 * 1000),
//         verified: false,
//         attempts: 0,
//       };

//       await updatedOrder.save();

//       console.log("🔐 DELIVERY OTP:", otp);

//       // 📲 PHONE FORMAT
//       let userPhone =
//         paymentData.notes?.phone || updatedOrder.address?.phone;

//       console.log("📞 RAW PHONE:", userPhone);

//       if (userPhone) {
//         userPhone = userPhone.toString().replace(/\D/g, "");

//         if (userPhone.length === 10) {
//           userPhone = "91" + userPhone;
//         }

//         console.log("📞 FINAL PHONE:", userPhone);

//         // 🔥 SEND OTP TEMPLATE
//         // try {
//         //   const otpRes = await sendAuthTemplate("+" + userPhone, otp);
//         //   console.log("📲 OTP WhatsApp Response:", otpRes);
//         // } catch (err) {
//         //   console.error("❌ OTP send error:", err.message);
//         // }

//         // 🔥 SEND ORDER MESSAGE
//         const orderNumber = updatedOrder.orderNumber;

//         const msg = `🎉 *Order Confirmed!*

// 🧾 Order: ${orderNumber}

// 🔐 OTP: ${otp}

// ⚠️ Delivery ke time rider ko OTP batana hai.`;

//         const interactiveMsg = {
//           type: "button",
//           body: { text: msg },
//           action: {
//             buttons: [
//               {
//                 type: "reply",
//                 reply: { id: "track", title: "📦 Track Order" },
//               },
//             ],
//           },
//         };

//         try {
//           await sendInteractiveMessage(userPhone, interactiveMsg);
//           console.log("✅ Order WhatsApp sent");
//         } catch (err) {
//           console.error("❌ Order message error:", err.message);
//         }
//       } else {
//         console.log("❌ Phone not found");
//       }
//     }

//     return res.status(200).json({ status: "ok" });
//   } catch (error) {
//     console.error("🔥 Webhook error:", error);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// };