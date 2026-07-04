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
const {sendWhatsAppMessage} = require("./../utils/whatsaap/sendTemplate.js");
const MenuItem = require("../models/dining/menuItemmodel"); 
const DeliverySetting = require("../models/Setting"); 

const CouponUsage = require("../models/couponUsageModel.js");
const Coupon = require("../models/couponModel.js");

// ✅ IMPORT DAILY ROSTER MODEL
const DailyRoster = require("../models/dining/DailyRoster.js");

// ==========================================
// 🛠️ HELPER: BULLETPROOF ROSTER DEDUCTION
// ==========================================
const deductRosterQuantities = async (orderItems) => {
  try {
    // 1. Aaj ki date IST mein nikalo (100% Safe Native JS Method)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours for IST
    const istDate = new Date(now.getTime() + istOffset);
    
    const yyyy = istDate.getUTCFullYear();
    const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(istDate.getUTCDate()).padStart(2, '0');
    
    const todayStr = `${yyyy}-${mm}-${dd}`; // E.g., "2026-06-12"

    // 2. MongoDB Date Query ke liye exact range (Midnight to Midnight IST)
    const startOfDay = new Date(`${todayStr}T00:00:00.000+05:30`);
    const endOfDay = new Date(`${todayStr}T23:59:59.999+05:30`);

    // 3. Proper Query 
    const roster = await DailyRoster.findOne({ 
      date: { $gte: startOfDay, $lte: endOfDay } 
    }).populate("items.id", "name");
    
    if (!roster || !roster.items || roster.items.length === 0) {
      console.log(`⚠️ No active roster found in DB for today (${todayStr})`);
      return;
    }

    let isUpdated = false;
    let lowStockItemsList = []; 
    const LOW_STOCK_THRESHOLD = 5; 

    // 4. Deduction Logic
    for (const orderItem of orderItems) {
      const rosterItemIndex = roster.items.findIndex(
        (i) => i.id && i.id._id.toString() === orderItem.menuItem.toString()
      );

      if (rosterItemIndex > -1) {
        roster.items[rosterItemIndex].quantity -= orderItem.quantity;
        if (roster.items[rosterItemIndex].quantity < 0) {
          roster.items[rosterItemIndex].quantity = 0; 
        }
        isUpdated = true;

        const currentQty = roster.items[rosterItemIndex].quantity;
        if (currentQty <= LOW_STOCK_THRESHOLD) {
          const itemName = roster.items[rosterItemIndex].id.name || "Unknown Item";
          lowStockItemsList.push(`${itemName} (Only ${currentQty} left)`);
        }
      }
    }

    if (isUpdated) {
      await roster.save();
      console.log(`📉 Roster quantities successfully deducted for ${todayStr}`);

      // 🚨 LOW STOCK ALERTS (WhatsApp + WebSocket)
      if (lowStockItemsList.length > 0) {
        
        try {
          const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER; 
          if (adminPhone) {
            const alertMsg = `⚠️ *URGENT: Low Stock Alert!*\n\nThe following items are running out fast for today's menu:\n\n` +
                             lowStockItemsList.map(i => `🔸 ${i}`).join("\n") +
                             `\n\nPlease update the inventory or daily roster immediately.`;
            await sendTextMessage(adminPhone, alertMsg);
          }
        } catch (waErr) {
          console.error("⚠️ WhatsApp Low Stock Alert failed, ignoring:", waErr.message);
        }

        try {
          const io = getIO();
          io.to("admin_room").emit("low_stock_alert", {
            success: false, 
            title: "⚠️ Low Stock Alert",
            message: "Some items are running out of stock!",
            items: lowStockItemsList, 
            time: new Date()
          });
          console.log("⚡ Low stock Socket event emitted to admin_room.");
        } catch (socketErr) {
          console.error("⚠️ Socket emit error (Low Stock), ignoring to keep flow safe:", socketErr.message);
        }
      }
    }
  } catch (err) {
    console.error("❌ Failed to deduct roster quantities (Flow will continue):", err.message);
  }
};


exports.previewTaxes = async (req, res, next) => {
  try {
    const { items } = req.body;

    const settings = await DeliverySetting.findOne();
    const foodGSTPercent = settings?.gst?.foodGSTPercent ?? 5;

    let taxableAmount = 0;

    for (const item of items) {
      const menuItem = await MenuItem.findById(item.menuItem)
        .populate({
          path: "subCategory",
          populate: { path: "category" },
        });

      const categoryName = menuItem?.subCategory?.category?.name?.toLowerCase().trim();

      if (categoryName !== "beverage") {
        taxableAmount += item.price * item.quantity;
      }
    }

    const taxes = Math.round(taxableAmount * (foodGSTPercent / 100));

    res.json({ success: true, taxes });
  } catch (err) {
    console.error("Preview taxes error:", err.message);
    next(err);
  }
};


exports.createOrder = async (req, res, next) => {
  try {
    const { items, addressId, noContact, total, couponCode, couponDiscount = 0 } = req.body;
    const userId = req.userId;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: "Order must contain at least one item" });
    }

    if (!addressId) {
      return res.status(400).json({ success: false, message: "Delivery address is required" });
    }

    const address = await Address.findById(addressId);
    if (!address || address.user?.toString() !== userId?.toString()) {
      return res.status(403).json({ success: false, message: "Invalid delivery address" });
    }

    if (!total || total <= 0) {
      return res.status(400).json({ success: false, message: "Invalid total amount" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const settings = await DeliverySetting.findOne();
    const foodGSTPercent = settings?.gst?.foodGSTPercent ?? 5;

    let taxableAmount = 0;

    for (const item of items) {
      const menuItem = await MenuItem.findById(item.menuItem)
        .populate({
          path: "subCategory",
          populate: { path: "category" }
        });

      const categoryName = menuItem?.subCategory?.category?.name?.toLowerCase().trim();

      if (categoryName !== "beverage") {
        taxableAmount += item.price * item.quantity;
      }
    }

    const taxes = Math.round(taxableAmount * (foodGSTPercent / 100));

    const mobileString = (user.phone || user.mobile || "0000").toString();
    const lastFourDigits = mobileString.slice(-4).padStart(4, "0");

    const userWebOrderCount = await Order.countDocuments({
      user: userId,
      orderNumber: { $regex: '^ORD-Web-' }
    });
    const sequenceNumber = (userWebOrderCount + 1).toString().padStart(4, "0");
    const generatedOrderNumber = `ORD-Web-${lastFourDigits}-${sequenceNumber}`;

    const updatedItems = items.map((item) => ({
      ...item,
      total: item.price * item.quantity,
    }));

    const subtotal = items.reduce((acc, i) => acc + i.price * i.quantity, 0);

    const newOrder = new Order({
      orderNumber: generatedOrderNumber,
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
        subtotal, 
        taxes, 
        total,
      },
      noContact: noContact || false,
      status: "pending",
      payment: { status: "pending" },
    });

    const savedOrder = await newOrder.save();

    const couponDoc = await Coupon.findOne({ code: couponCode });

    if (couponDoc && couponCode) {
      await CouponUsage.create({
        coupon: couponDoc._id,
        user: userId,
        orderId: savedOrder._id,
        discountApplied: couponDiscount,
      });
    }

    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create({
        amount: Math.round(total) * 100,
        currency: "INR",
        receipt: `receipt_${savedOrder._id}`,
      });
    } catch (err) {
      await Order.findByIdAndDelete(savedOrder._id);
      return res.status(502).json({ success: false, message: "Payment gateway error. Please try again." });
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
      message: "Order created successfully.",
      data: savedOrder,
      razorpayOrder,
      taxes, 
    });

  } catch (err) {
    console.error("Create Order Error:", err.message);
    next(err);
  }
};

exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

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
        { status: "FAILED" }
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

    let captured;
    try {
      captured = await razorpay.payments.capture(
        razorpay_payment_id,
        Math.round(payment.amount) * 100
      );
    } catch (err) {
      captured = { status: "captured", method: "unknown" };
    }

    await Payment.findByIdAndUpdate(payment._id, {
      status: "SUCCESS",
      transactionId: razorpay_payment_id,
    });

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

    if (!updatedOrder) {
      return res.status(200).json({ success: true });
    }

    // ✅ SAFE ROSTER DEDUCTION CALL
    try {
      await deductRosterQuantities(updatedOrder.items);
    } catch (rosterErr) {
      console.error("⚠️ Roster deduction threw an error, ignoring to save main flow:", rosterErr.message);
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = hashOTP(otp); 

    updatedOrder.deliveryOTP = {
      code: hashedOtp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), 
      verified: false,
      attempts: 0,
    };

    await updatedOrder.save();

    try {
      const io = getIO();
      io.to(updatedOrder._id.toString()).emit("payment_success", {
        success: true,
        orderId: updatedOrder._id,
        status: updatedOrder.status,
        message: "Payment successful & order confirmed",
      });
      
      io.to("admin_room").emit("admin_new_order", {
        order: updatedOrder,
        message: "New order paid and confirmed",
      });
    } catch (socketErr) {
      console.error("⚠️ Socket emit error (Verify Payment):", socketErr.message);
    }

    const populatedOrder = await Order.findById(updatedOrder._id).populate("user", "phone");

    let userPhone = updatedOrder.address?.phone || populatedOrder.user?.phone;

    if (userPhone) {
      userPhone = userPhone.toString().replace(/\D/g, ""); 

      if (userPhone.length === 10) {
        userPhone = "91" + userPhone; 
      }

      try {
        await sendWhatsAppMessage({
          to: userPhone,
          type: "template",
          templateName: "order_otp_verification",
          parameters: [
            updatedOrder.orderNumber || updatedOrder._id, 
            otp 
          ]
        });
      } catch (err) {
        console.error("❌ WhatsApp Error:", err.message);
      }
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


// exports.handleWebhook = async (req, res) => {
//   try {
//     const webhookSignature = req.headers["x-razorpay-signature"];
//     const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

//     const rawBody = req.body.toString("utf8");

//     const expectedSignature = crypto
//       .createHmac("sha256", WEBHOOK_SECRET)
//       .update(rawBody)
//       .digest("hex");

//     if (expectedSignature !== webhookSignature) {
//       return res.status(400).json({ error: "Invalid signature" });
//     }

//     const payload = JSON.parse(rawBody);
//     const eventType = payload.event;
//     const paymentData = payload.payload.payment.entity;

//     const dbOrderId = paymentData.notes?.dbOrderId;

//     if (!dbOrderId) {
//       return res.status(200).json({ status: "ok" });
//     }

//     if (eventType === "payment.captured" || eventType === "payment_link.paid") {
//       const payment = await Payment.findOne({ order: dbOrderId });

//       if (!payment || payment.status === "SUCCESS") {
//         return res.status(200).json({ status: "ok" });
//       }

//       await Payment.findByIdAndUpdate(payment._id, {
//         status: "SUCCESS",
//         transactionId: paymentData.id,
//       });

//       const otp = Math.floor(100000 + Math.random() * 900000).toString();
//       const hashedOtp = hashOTP(otp);

//       const updatedOrder = await Order.findByIdAndUpdate(
//         dbOrderId,
//         {
//           "payment.status": "paid",
//           "payment.transactionId": paymentData.id,
//           "payment.method": paymentData.method || "razorpay",
//           status: "confirmed",
//           "timeline.confirmedAt": new Date(),
//           "deliveryOTP.code": hashedOtp,
//           "deliveryOTP.verified": false,
//           "deliveryOTP.attempts": 0,
//         },
//         { returnDocument: "after" } 
//       ).populate("user", "phone"); 

//       if (!updatedOrder) {
//         return res.status(200).json({ status: "ok" });
//       }

//       // ✅ SAFE ROSTER DEDUCTION CALL
//       try {
//         await deductRosterQuantities(updatedOrder.items);
//       } catch (rosterErr) {
//         console.error("⚠️ Webhook: Roster deduction threw an error:", rosterErr.message);
//       }

//       try {
//         const io = getIO();
//         io.to(updatedOrder._id.toString()).emit("payment_success", {
//           success: true,
//           orderId: updatedOrder._id,
//           status: updatedOrder.status,
//           message: "Payment captured successfully via webhook",
//         });

//         io.to("admin_room").emit("admin_new_order", {
//           order: updatedOrder,
//           message: "New order paid and confirmed via webhook",
//         });
//       } catch (socketErr) {
//         console.error("⚠️ Socket emit error (Webhook):", socketErr.message);
//       }

//       let userPhone = paymentData.notes?.phone || updatedOrder.address?.phone || updatedOrder.user?.phone;

//       if (userPhone) {
//         userPhone = userPhone.toString().replace(/\D/g, "");

//         if (userPhone.length === 10) {
//           userPhone = "91" + userPhone;
//         }

//         const orderNumber = updatedOrder.orderNumber || updatedOrder._id.toString().slice(-6).toUpperCase();

//         const msg = `🎉 *Order Confirmed!*\n\n🧾 Order: ${orderNumber}\n\n🔐 OTP: ${otp}\n\n⚠️ Please share this OTP with the delivery partner at the time of delivery.`;

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
//         } catch (err) {
//           console.error("❌ Order message error:", err.message);
//         }
//       }
//     }

//     return res.status(200).json({ status: "ok" });
    
//   } catch (error) {
//     console.error("🔥 Webhook error:", error);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// };



exports.handleWebhook = async (req, res) => {
  try {
    const webhookSignature = req.headers["x-razorpay-signature"];
    const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

    const rawBody = req.body.toString("utf8");

    const expectedSignature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== webhookSignature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.event;
    const paymentData = payload.payload.payment.entity;

    const dbOrderId = paymentData.notes?.dbOrderId;

    if (!dbOrderId) {
      return res.status(200).json({ status: "ok" });
    }

    if (eventType === "payment.captured" || eventType === "payment_link.paid") {
      const payment = await Payment.findOne({ order: dbOrderId });

      if (!payment || payment.status === "SUCCESS") {
        return res.status(200).json({ status: "ok" });
      }

      await Payment.findByIdAndUpdate(payment._id, {
        status: "SUCCESS",
        transactionId: paymentData.id,
      });

      const existingOrder = await Order.findById(dbOrderId);
      if (!existingOrder) {
         return res.status(200).json({ status: "ok" });
      }

      // ✅ MAIN FIX: Check kariye ki OTP pehle se hai ya nahi
      let hashedOtp = existingOrder.deliveryOTP?.code;
      let newOtpForWhatsapp = null;

      if (!hashedOtp) {
        // Sirf tabhi naya banaiye agar pehle se nahi hai
        newOtpForWhatsapp = Math.floor(100000 + Math.random() * 900000).toString();
        hashedOtp = hashOTP(newOtpForWhatsapp);
      }

      const updatedOrder = await Order.findByIdAndUpdate(
        dbOrderId,
        {
          "payment.status": "paid",
          "payment.transactionId": paymentData.id,
          "payment.method": paymentData.method || "razorpay",
          status: "confirmed",
          "timeline.confirmedAt": new Date(),
          "deliveryOTP.code": hashedOtp, // Yahan existing hash ya naya hash update hoga
          "deliveryOTP.verified": false,
          "deliveryOTP.attempts": existingOrder.deliveryOTP?.attempts || 0,
        },
        { returnDocument: "after" } 
      ).populate("user", "phone"); 

      if (!updatedOrder) {
        return res.status(200).json({ status: "ok" });
      }

      // ✅ SAFE ROSTER DEDUCTION CALL
      try {
        await deductRosterQuantities(updatedOrder.items);
      } catch (rosterErr) {
        console.error("⚠️ Webhook: Roster deduction threw an error:", rosterErr.message);
      }

      try {
        const io = getIO();
        io.to(updatedOrder._id.toString()).emit("payment_success", {
          success: true,
          orderId: updatedOrder._id,
          status: updatedOrder.status,
          message: "Payment captured successfully via webhook",
        });

        io.to("admin_room").emit("admin_new_order", {
          order: updatedOrder,
          message: "New order paid and confirmed via webhook",
        });
      } catch (socketErr) {
        console.error("⚠️ Socket emit error (Webhook):", socketErr.message);
      }

      // ✅ WhatsApp message SIRF tabhi bhejein jab NAYA OTP generate hua ho
      if (newOtpForWhatsapp) {
        let userPhone = paymentData.notes?.phone || updatedOrder.address?.phone || updatedOrder.user?.phone;

        if (userPhone) {
          userPhone = userPhone.toString().replace(/\D/g, "");

          if (userPhone.length === 10) {
            userPhone = "91" + userPhone;
          }

          const orderNumber = updatedOrder.orderNumber || updatedOrder._id.toString().slice(-6).toUpperCase();

          const msg = `🎉 *Order Confirmed!*\n\n🧾 Order: ${orderNumber}\n\n🔐 OTP: ${newOtpForWhatsapp}\n\n⚠️ Please share this OTP with the delivery partner at the time of delivery.`;

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
          } catch (err) {
            console.error("❌ Order message error:", err.message);
          }
        }
      }
    }

    return res.status(200).json({ status: "ok" });
    
  } catch (error) {
    console.error("🔥 Webhook error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

