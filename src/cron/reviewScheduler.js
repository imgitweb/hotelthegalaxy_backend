// src/cron/reviewScheduler.js
const cron = require("node-cron");
const Order = require("../models/User/ordersModel");
const { sendReviewWhatsApp } = require("../services/smsService");

const scheduleReviewMessages = () => {
  // Ye cron job har 5 minute mein ek baar chalegi (*/5 * * * *)
  cron.schedule("*/5 * * * *", async () => {
    try {
      console.log("⏳ Checking for orders ready for review message...");

      // 40 minute pehle ka time nikalein
      const fortyMinsAgo = new Date(Date.now() - 40 * 60 * 1000);
      
      // 24 ghante pehle ka time (Taki hum bohot purane orders ko check na karein)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Aise orders dhoondho jo deliver ho chuke hain 40 mins pehle, 
      // aur unhe ab tak review SMS nahi gaya hai
      const ordersReadyForReview = await Order.find({
        status: "delivered",
        "timeline.deliveredAt": { $lte: fortyMinsAgo, $gte: oneDayAgo },
        reviewSmsSent: false // (Step 2 mein jo field add ki thi)
      }).populate("user", "fullName phone");

      if (ordersReadyForReview.length === 0) return;

      for (const order of ordersReadyForReview) {
        const phone = order.user?.phone || order.phone || order.mobile;
        const name = order.user?.fullName || order.customerName || "Customer";
        const orderId = order._id.toString();

        if (phone) {
          // WhatsApp message bhejenge
          await sendReviewWhatsApp(phone, name, orderId);
        }

        // Database mein mark kar denge ki message chala gaya hai
        order.reviewSmsSent = true;
        await order.save();
      }

    } catch (error) {
      console.error("❌ Error in review cron scheduler:", error);
    }
  });
};

module.exports = scheduleReviewMessages;