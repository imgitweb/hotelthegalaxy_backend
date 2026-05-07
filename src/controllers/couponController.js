const Coupon = require("../models/couponModel.js");
const CouponUsage = require("../models/couponUsageModel.js");
const User = require("../models/User.js"); 
const crypto = require("crypto"); 
const { sendWhatsAppMessage } = require("../utils/whatsaap/sendTemplate.js");

// ==========================================
// 🔥 HELPER FUNCTIONS FOR TEMPLATE FORMATTING
// ==========================================
const getDiscountText = (type, value) => {
  if (type === "flat") return `₹${value}`;
  if (type === "percentage") return `${value}%`;
  return "Free Delivery";
};

const getMinOrderText = (value) => {
  return value && value > 0 ? `₹${value}` : "No Minimum";
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 🔥 BACKGROUND JOBS FOR WHATSAPP
// ==========================================

// 1. Single Coupon Broadcast
const sendSingleCouponToAllUsers = async (coupon) => {
  try {
    const users = await User.find({ phone: { $exists: true, $ne: null, $ne: "" } });

    if (!users || users.length === 0) return;
    console.log(`🚀 Sending General Coupon to ${users.length} users...`);

    const discountText = getDiscountText(coupon.discountType, coupon.discountValue);
    const minOrderText = getMinOrderText(coupon.minOrderValue);
    const validTillString = new Date(coupon.validTill).toLocaleDateString("en-IN"); 

    for (const user of users) {
      try {
        await sendWhatsAppMessage({
          to: user.phone,
          type: "template",
          templateName: "coupon_created_offer",
          parameters: [coupon.code, discountText, minOrderText, validTillString]
        });
      } catch (err) {
        console.error(`❌ WA Failed for ${user.phone}:`, err.message);
      }
    }
    console.log("🎉 General Coupon Broadcast Completed!");
  } catch (error) {
    console.error("❌ Error in sendSingleCouponToAllUsers:", error);
  }
};

// 2. Bulk Unique Coupon Broadcast
const sendBulkCouponsToUsers = async (users, bulkCoupons) => {
  try {
    console.log(`🚀 Sending ${bulkCoupons.length} Unique Bulk Coupons to users...`);

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const assignedCoupon = bulkCoupons[i];

      const discountText = getDiscountText(assignedCoupon.discountType, assignedCoupon.discountValue);
      const minOrderText = getMinOrderText(assignedCoupon.minOrderValue);
      const validTillString = new Date(assignedCoupon.validTill).toLocaleDateString("en-IN");

      let userPhone = String(user.phone).trim();
      if (userPhone.length === 10) userPhone = `91${userPhone}`;
      else if (userPhone.startsWith("+")) userPhone = userPhone.substring(1);

      let messageSent = false;
      try {
        await sendWhatsAppMessage({
          to: userPhone,
          type: "template",
          templateName: "coupon_created_offer",
          parameters: [assignedCoupon.code, discountText, minOrderText, validTillString]
        });

        await sleep(200); 
        messageSent = true;
      } catch (err) {
        console.error(`❌ WA Failed for ${userPhone} with code ${assignedCoupon.code}:`, err.message);
        messageSent = false;
      }

      // Mark the coupon as processed and update Sent status
      if (assignedCoupon._id) {
        await Coupon.findByIdAndUpdate(assignedCoupon._id, { 
          isSent: messageSent, 
          isProcessed: true 
        });
      }
    }
    console.log("🎉 Bulk Coupon Broadcast Completed!");
  } catch (error) {
    console.error("❌ Error in sendBulkCouponsToUsers:", error);
  }
};

// ==========================================
// 🍔 CONTROLLERS
// ==========================================

exports.createCoupon = async (req, res) => {
  try {
    const {
      code, discountType, discountValue, maxDiscountCap, minOrderValue,
      validFrom, validTill, usageLimit, perUserLimit, description, tag, isBulk
    } = req.body;

    if (!validTill) {
      return res.status(400).json({ success: false, message: "Valid Till date is required" });
    }

    if (isBulk === true || isBulk === "true") {
      const users = await User.find({ phone: { $exists: true, $ne: null, $ne: "" } });
      
      if (!users || users.length === 0) {
        return res.status(400).json({ success: false, message: "No valid users found to send bulk coupons" });
      }

      const batchId = `BATCH_${Date.now()}`;
      const bulkCoupons = [];
      const prefix = code ? code.toUpperCase().substring(0, 10) : "OFR"; 

      for (let i = 0; i < users.length; i++) {
        const randomStr = crypto.randomBytes(3).toString("hex").toUpperCase();
        const uniqueCode = `${prefix}${randomStr}`;

        bulkCoupons.push({
          code: uniqueCode, discountType, discountValue: discountValue || 0,
          maxDiscountCap: maxDiscountCap || null, minOrderValue: minOrderValue || 0,
          validFrom: validFrom || new Date(), validTill,
          usageLimit: 1, perUserLimit: 1, description, tag,
          isBulk: true, batchId,
          isProcessed: false, isSent: false // Set flags natively
        });
      }

      const inserted = await Coupon.insertMany(bulkCoupons);
      sendBulkCouponsToUsers(users, inserted);

      return res.status(201).json({ 
        success: true, 
        message: `${users.length} bulk unique coupons created and WhatsApp broadcast started!`,
        batchId 
      });

    } else {
      const codeRegex = /^[A-Z0-9]{4,20}$/;
      if (!codeRegex.test(code?.toUpperCase())) {
        return res.status(400).json({ success: false, message: "Coupon code must be 4–20 alphanumeric characters" });
      }

      const existing = await Coupon.findOne({ code: code.toUpperCase(), isDeleted: false });
      if (existing) {
        return res.status(400).json({ success: false, message: "Coupon code already exists" });
      }

      const coupon = await Coupon.create({
        code: code.toUpperCase(), discountType, discountValue: discountValue || 0,
        maxDiscountCap: maxDiscountCap || null, minOrderValue: minOrderValue || 0,
        validFrom: validFrom || new Date(), validTill, usageLimit: usageLimit || null,
        perUserLimit: perUserLimit || 1, description, tag, isBulk: false
      });

      sendSingleCouponToAllUsers(coupon);

      return res.status(201).json({ success: true, coupon });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.generateBulkCoupons = async (req, res) => {
  try {
    const { count, prefix = "", codeLength = 8, discountType, discountValue, maxDiscountCap, minOrderValue, validFrom, validTill, description, tag } = req.body;

    if (!count || count < 1 || count > 50000) return res.status(400).json({ success: false, message: "Count must be between 1 and 50000" });
    if (!validTill) return res.status(400).json({ success: false, message: "Valid Till date is required" });

    const batchId = `BATCH-${Date.now()}`;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const generatedCodes = new Set();

    while (generatedCodes.size < count) {
      let randomPart = "";
      for (let i = 0; i < codeLength; i++) randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
      generatedCodes.add((prefix.toUpperCase() + randomPart).substring(0, 20));
    }

    const couponsArray = Array.from(generatedCodes).map(code => ({
      code, discountType, discountValue: discountValue || 0, maxDiscountCap: maxDiscountCap || null, 
      minOrderValue: minOrderValue || 0, validFrom: validFrom || new Date(), validTill,
      usageLimit: 1, perUserLimit: 1, description: description || "Bulk Generated Coupon", 
      tag: tag || "Bulk", isBulk: true, batchId,
      isProcessed: false, isSent: false // Start out as false
    }));

    const result = await Coupon.insertMany(couponsArray, { ordered: false });

    // 🔥 MAIN FIX LOGIC 🔥
    const users = await User.find({ phone: { $exists: true, $ne: null, $ne: "" } });
    let maxMessagesToSend = 0;

    if (users && users.length > 0) {
      maxMessagesToSend = Math.min(users.length, result.length);
      const targetUsers = users.slice(0, maxMessagesToSend);
      const targetCoupons = result.slice(0, maxMessagesToSend);

      sendBulkCouponsToUsers(targetUsers, targetCoupons);
    }

    // 🔥 DUMP EXCESS COUPONS TO PROCESSED TRUE
    const excessCoupons = result.slice(maxMessagesToSend);
    if (excessCoupons.length > 0) {
      const excessIds = excessCoupons.map(c => c._id);
      await Coupon.updateMany(
        { _id: { $in: excessIds } },
        { $set: { isProcessed: true, isSent: false } }
      );
    }

    res.status(201).json({
      success: true,
      message: `Successfully generated ${result.length} coupons and sending to users in background!`,
      batchId
    });
  } catch (err) {
    if (err.code === 11000) {
      res.status(201).json({
        success: true, message: "Generated coupons (some skipped due to collision)",
        batchId: req.body.batchId || `BATCH-${Date.now()}`
      });
    } else {
      res.status(500).json({ success: false, message: err.message });
    }
  }
};

exports.exportBulkCoupons = async (req, res) => {
  try {
    const { batchId } = req.params;
    
    // Validate if processing is done
    const pendingCouponsCount = await Coupon.countDocuments({ batchId, isProcessed: false });
    if (pendingCouponsCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `WhatsApp broadcast is still running. Please wait a few minutes before exporting. (${pendingCouponsCount} messages left)` 
      });
    }

    const coupons = await Coupon.find({ batchId }).select("code discountType discountValue minOrderValue validTill isActive usedCount usageLimit isSent -_id");

    if (!coupons.length) return res.status(404).json({ success: false, message: "No coupons found for this batch" });

    let csv = "Code,Discount Type,Discount Value,Min Order,Valid Till,Status,Usage,Sent Status\n";
    coupons.forEach(c => {
      const status = c.isActive ? "Active" : "Disabled";
      const sentStatus = c.isSent ? "Sent ✅" : "Not Sent ❌";
      csv += `${c.code},${c.discountType},${c.discountValue},${c.minOrderValue},${new Date(c.validTill).toLocaleDateString("en-IN")},${status},${c.usedCount}/${c.usageLimit},${sentStatus}\n`;
    });

    res.header("Content-Type", "text/csv");
    res.attachment(`coupons-${batchId}.csv`);
    return res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// ADMIN: Get all coupons
// ─────────────────────────────────────────────
exports.getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(1000); 
    const couponIds = coupons.map((c) => c._id);
    const usageCounts = await CouponUsage.aggregate([
      { $match: { coupon: { $in: couponIds } } },
      { $group: { _id: "$coupon", count: { $sum: 1 } } },
    ]);

    const usageMap = {};
    usageCounts.forEach((u) => { usageMap[u._id.toString()] = u.count; });

    const result = coupons.map((c) => ({ ...c.toObject(), actualUsageCount: usageMap[c._id.toString()] || 0 }));
    res.json({ success: true, coupons: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    delete req.body.code; delete req.body.usedCount;
    const coupon = await Coupon.findByIdAndUpdate(id, { ...req.body }, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    res.json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.toggleCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    coupon.isActive = !coupon.isActive; await coupon.save();
    res.json({ success: true, message: `Coupon ${coupon.isActive ? "enabled" : "disabled"}`, coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Coupon ID",
      });
    }

    const coupon = await Coupon.findByIdAndDelete(id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    res.json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.deleteBulkBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    if (!batchId) return res.status(400).json({ success: false, message: "batchId is required" });
    const result = await Coupon.deleteMany({ batchId });
    if (result.matchedCount === 0) return res.status(404).json({ success: false, message: "No coupons found for this batch" });
    res.json({ success: true, message: `${result.modifiedCount} coupons from batch deleted successfully`, deletedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCouponUsageReport = async (req, res) => {
  try {
    const { id } = req.params;
    const usages = await CouponUsage.find({ coupon: id }).populate("user", "fullName email").populate("orderId", "orderNumber total").sort({ createdAt: -1 });
    const totalDiscount = usages.reduce((sum, u) => sum + u.discountApplied, 0);
    res.json({ success: true, totalUses: usages.length, totalDiscountGiven: totalDiscount, usages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getActiveCoupons = async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true, isDeleted: false, isBulk: false, validFrom: { $lte: now }, validTill: { $gte: now },
    }).select("code discountType discountValue maxDiscountCap minOrderValue validTill description tag");
    res.json({ success: true, coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.validateCoupon = async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    const userId = req.userId;

    if (!code || !orderTotal) return res.status(400).json({ success: false, message: "Code and orderTotal are required" });

    const now = new Date();
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isDeleted: false });

    if (!coupon) return res.status(404).json({ success: false, message: "Invalid coupon code" });
    if (!coupon.isActive) return res.status(400).json({ success: false, message: "This coupon is no longer active" });
    if (now < coupon.validFrom || now > coupon.validTill) return res.status(400).json({ success: false, message: "Coupon has expired" });
    if (orderTotal < coupon.minOrderValue) return res.status(400).json({ success: false, message: `Add ₹${coupon.minOrderValue - orderTotal} more to use this coupon` });
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return res.status(400).json({ success: false, message: "Coupon usage limit reached" });

    const userUsageCount = await CouponUsage.countDocuments({ coupon: coupon._id, user: userId });
    if (userUsageCount >= coupon.perUserLimit) return res.status(400).json({ success: false, message: "You have already used this coupon" });

    if (coupon.isBulk && coupon.batchId) {
      const previousUsages = await CouponUsage.find({ user: userId }).select("coupon");
      const usedCouponIds = previousUsages.map((usage) => usage.coupon);
      if (usedCouponIds.length > 0) {
        const usedFromSameBatch = await Coupon.findOne({ _id: { $in: usedCouponIds }, batchId: coupon.batchId });
        if (usedFromSameBatch) return res.status(400).json({ success: false, message: "You have already used a coupon from this promotional batch." });
      }
    }

    let discount = 0;
    if (coupon.discountType === "flat") discount = coupon.discountValue;
    else if (coupon.discountType === "percentage") {
      discount = Math.round((orderTotal * coupon.discountValue) / 100);
      if (coupon.maxDiscountCap) discount = Math.min(discount, coupon.maxDiscountCap);
    } else if (coupon.discountType === "free_delivery") discount = 0;

    discount = Math.min(discount, orderTotal);

    res.json({
      success: true, discount,
      coupon: { code: coupon.code, discountType: coupon.discountType, freeDelivery: coupon.discountType === "free_delivery" },
      message: `Coupon applied! You save ₹${discount}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};











// const Coupon = require("../models/couponModel.js");
// const CouponUsage = require("../models/couponUsageModel.js");
// const User = require("../models/User.js"); // 🔥 Imported User Model
// const crypto = require("crypto"); // Unique string generate karne ke liye
// const { sendWhatsAppMessage } = require("../utils/whatsaap/sendTemplate.js");

// // ==========================================
// // 🔥 HELPER FUNCTIONS FOR TEMPLATE FORMATTING
// // ==========================================
// const getDiscountText = (type, value) => {
//   if (type === "flat") return `₹${value}`;
//   if (type === "percentage") return `${value}%`;
//   return "Free Delivery";
// };

// const getMinOrderText = (value) => {
//   return value && value > 0 ? `₹${value}` : "No Minimum";
// };

// // ==========================================
// // 🔥 BACKGROUND JOBS FOR WHATSAPP
// // ==========================================

// // 1. Single Coupon Broadcast (Jab isBulk: false ho)
// const sendSingleCouponToAllUsers = async (coupon) => {
//   try {
//     const users = await User.find({ phone: { $exists: true, $ne: null, $ne: "" } });

//     if (!users || users.length === 0) return;
//     console.log(`🚀 Sending General Coupon to ${users.length} users...`);

//     const discountText = getDiscountText(coupon.discountType, coupon.discountValue); // {{2}}
//     const minOrderText = getMinOrderText(coupon.minOrderValue); // {{3}}
//     const validTillString = new Date(coupon.validTill).toLocaleDateString("en-IN"); // {{4}}

//     for (const user of users) {
//       try {
//         await sendWhatsAppMessage({
//           to: user.phone,
//           type: "template",
//           templateName: "coupon_created_offer",
//           parameters: [
//             coupon.code,       // {{1}} Coupon Code
//             discountText,      // {{2}} Discount Text
//             minOrderText,      // {{3}} Min Order
//             validTillString    // {{4}} Valid Till
//           ]
//         });
//       } catch (err) {
//         console.error(`❌ WA Failed for ${user.phone}:`, err.message);
//       }
//     }
//     console.log("🎉 General Coupon Broadcast Completed!");
//   } catch (error) {
//     console.error("❌ Error in sendSingleCouponToAllUsers:", error);
//   }
// };

// // 2. Bulk Unique Coupon Broadcast (Jab isBulk: true ho)
// // Yahan users array aur unke corresponding coupons array pass kiye jayenge
// const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// const sendBulkCouponsToUsers = async (users, bulkCoupons) => {
//   try {
//     console.log(`🚀 Sending ${bulkCoupons.length} Unique Bulk Coupons to users...`);

//     for (let i = 0; i < users.length; i++) {
//       const user = users[i];
//       const assignedCoupon = bulkCoupons[i];

//       const discountText = getDiscountText(assignedCoupon.discountType, assignedCoupon.discountValue);
//       const minOrderText = getMinOrderText(assignedCoupon.minOrderValue);
//       const validTillString = new Date(assignedCoupon.validTill).toLocaleDateString("en-IN");

//       let userPhone = String(user.phone).trim();
//       if (userPhone.length === 10) {
//         userPhone = `91${userPhone}`;
//       } else if (userPhone.startsWith("+")) {
//         userPhone = userPhone.substring(1);
//       }

//       let messageSent = false; // 🔥 Track success/fail easily

//       try {
//         await sendWhatsAppMessage({
//           to: userPhone,
//           type: "template",
//           templateName: "coupon_created_offer",
//           parameters: [
//             assignedCoupon.code,
//             discountText,
//             minOrderText,
//             validTillString
//           ]
//         });

//         await sleep(200); 
//         messageSent = true; // Message chala gaya
//       } catch (err) {
//         console.error(`❌ WA Failed for ${userPhone} with code ${assignedCoupon.code}:`, err.message);
//         messageSent = false; // Message fail ho gaya
//       }

//       // 🔥 NAYA CODE: Har haal mein update karenge ki process ho gaya (success ho ya fail)
//       if (assignedCoupon._id) {
//         await Coupon.findByIdAndUpdate(assignedCoupon._id, { 
//           isSent: messageSent, 
//           isProcessed: true 
//         });
//       }
//     }
//     console.log("🎉 Bulk Coupon Broadcast Completed!");
//   } catch (error) {
//     console.error("❌ Error in sendBulkCouponsToUsers:", error);
//   }
// };



// // ==========================================
// // 🍔 CONTROLLER: CREATE COUPON
// // ==========================================
// exports.createCoupon = async (req, res) => {
//   try {
//     consol.log("............")
//     const {
//       code, discountType, discountValue, maxDiscountCap, minOrderValue,
//       validFrom, validTill, usageLimit, perUserLimit, description, tag, isBulk
//     } = req.body;

//     // Dates validation
//     if (!validTill) {
//       return res.status(400).json({ success: false, message: "Valid Till date is required" });
//     }

//     // --------------------------------------------------------
//     // 🔥 SCENARIO 1: BULK COUPON CREATION (Unique for every user)
//     // --------------------------------------------------------
//     if (isBulk === true || isBulk === "true") {
//       const users = await User.find({ phone: { $exists: true, $ne: null, $ne: "" } });
//       console.log("bulk hit")
      
//       if (!users || users.length === 0) {
//         return res.status(400).json({ success: false, message: "No valid users found to send bulk coupons" });
//       }

//       const batchId = `BATCH_${Date.now()}`;
//       const bulkCoupons = [];
      
//       // Agar code pass kiya hai toh usko PREFIX manenge (e.g. 'OFFER' -> 'OFFER1A2B')
//       // Agar nahi kiya toh default 'OFR' prefix lenge
//       const prefix = code ? code.toUpperCase().substring(0, 10) : "OFR"; 

//       for (let i = 0; i < users.length; i++) {
//         // Generate random 6 character hex string
//         const randomStr = crypto.randomBytes(3).toString("hex").toUpperCase();
//         const uniqueCode = `${prefix}${randomStr}`; // Example: DIWALI8F3A1B

//         bulkCoupons.push({
//           code: uniqueCode,
//           discountType,
//           discountValue: discountValue || 0,
//           maxDiscountCap: maxDiscountCap || null,
//           minOrderValue: minOrderValue || 0,
//           validFrom: validFrom || new Date(),
//           validTill,
//           usageLimit: 1, // Bulk mein har code generally sirf 1 baar use hota hai
//           perUserLimit: 1,
//           description,
//           tag,
//           isBulk: true,
//           batchId
//         });
//       }

//       // Save all unique coupons in DB at once (Fastest way)
//       await Coupon.insertMany(bulkCoupons);
//       console.log("copon end")

//       // Trigger Background Job
//       sendBulkCouponsToUsers(users, bulkCoupons);

//       return res.status(201).json({ 
//         success: true, 
//         message: `${users.length} bulk unique coupons created and WhatsApp broadcast started!`,
//         batchId 
//       });

//     } 
//     // --------------------------------------------------------
//     // 🔥 SCENARIO 2: SINGLE COUPON CREATION (One code for all)
//     // --------------------------------------------------------
//     else {
//       const codeRegex = /^[A-Z0-9]{4,20}$/;
//       if (!codeRegex.test(code?.toUpperCase())) {
//         return res.status(400).json({ success: false, message: "Coupon code must be 4–20 alphanumeric characters" });
//       }

//       const existing = await Coupon.findOne({ code: code.toUpperCase(), isDeleted: false });
//       if (existing) {
//         return res.status(400).json({ success: false, message: "Coupon code already exists" });
//       }

//       const coupon = await Coupon.create({
//         code: code.toUpperCase(), 
//         discountType, 
//         discountValue: discountValue || 0,
//         maxDiscountCap: maxDiscountCap || null, 
//         minOrderValue: minOrderValue || 0,
//         validFrom: validFrom || new Date(), 
//         validTill, 
//         usageLimit: usageLimit || null,
//         perUserLimit: perUserLimit || 1, 
//         description, 
//         tag,
//         isBulk: false
//       });

//       // Trigger Background Job
//       sendSingleCouponToAllUsers(coupon);

//       return res.status(201).json({ success: true, coupon });
//     }

//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// exports.generateBulkCoupons = async (req, res) => {
//   try {
//     const {
//       count, prefix = "", codeLength = 8, discountType, discountValue,
//       maxDiscountCap, minOrderValue, validFrom, validTill, description, tag
//     } = req.body;

//     if (!count || count < 1 || count > 50000) {
//       return res.status(400).json({ success: false, message: "Count must be between 1 and 50000" });
//     }

//     if (!validTill) {
//       return res.status(400).json({ success: false, message: "Valid Till date is required" });
//     }

//     const batchId = `BATCH-${Date.now()}`;
//     const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
//     const generatedCodes = new Set();

//     // Generate unique codes (using Set to prevent duplicates in current batch)
//     while (generatedCodes.size < count) {
//       let randomPart = "";
//       for (let i = 0; i < codeLength; i++) {
//         randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
//       }
//       const fullCode = (prefix.toUpperCase() + randomPart).substring(0, 20);
//       generatedCodes.add(fullCode);
//     }

//     const couponsArray = [];
//     for (const code of generatedCodes) {
//       couponsArray.push({
//         code, discountType, discountValue: discountValue || 0,
//         maxDiscountCap: maxDiscountCap || null, minOrderValue: minOrderValue || 0,
//         validFrom: validFrom || new Date(), validTill,
//         usageLimit: 1, // BULK RULE: 1 specific code can be used 1 time only globally
//         perUserLimit: 1, // BULK RULE: 1 user can use 1 code 1 time
//         description: description || "Bulk Generated Coupon",
//         tag: tag || "Bulk",
//         isBulk: true,
//         batchId
//       });
//     }

//     // Insert safely in DB
//     const result = await Coupon.insertMany(couponsArray, { ordered: false });

//     // ─────────────────────────────────────────────
//     // 🔥 NEW: Fetch Users and Send WhatsApp Messages
//     // ─────────────────────────────────────────────
//     const users = await User.find({ phone: { $exists: true, $ne: null, $ne: "" } });

//     if (users && users.length > 0) {
//       // Logic: Hum utne hi logo ko message bhej sakte hain jitne coupons generate hue hain
//       // Agar 100 users hain aur 50 coupons banaye hain, toh pehle 50 users ko jayega
//       const maxMessagesToSend = Math.min(users.length, result.length);
      
//       const targetUsers = users.slice(0, maxMessagesToSend);
//       const targetCoupons = result.slice(0, maxMessagesToSend);

//       // Trigger background WhatsApp job
//       sendBulkCouponsToUsers(targetUsers, targetCoupons);
      
//       console.log(`🚀 Started sending ${maxMessagesToSend} coupons to users...`);
//     }

//     res.status(201).json({
//       success: true,
//       message: `Successfully generated ${result.length} coupons and sending to users in background!`,
//       batchId
//     });
//   } catch (err) {
//     // If ordered: false, it will still insert non-duplicates even if some clash
//     if (err.code === 11000) {
//       res.status(201).json({
//         success: true,
//         message: "Generated coupons (some skipped due to code collision)",
//         batchId: req.body.batchId || `BATCH-${Date.now()}`
//       });
//     } else {
//       res.status(500).json({ success: false, message: err.message });
//     }
//   }
// };


// // exports.generateBulkCoupons = async (req, res) => {
// //   try {
// //     const {
// //       count, prefix = "", codeLength = 8, discountType, discountValue,
// //       maxDiscountCap, minOrderValue, validFrom, validTill, description, tag
// //     } = req.body;

// //     if (!count || count < 1 || count > 50000) {
// //       return res.status(400).json({ success: false, message: "Count must be between 1 and 50000" });
// //     }

// //     const batchId = `BATCH-${Date.now()}`;
// //     const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
// //     const generatedCodes = new Set();

// //     // Generate unique codes (using Set to prevent duplicates in current batch)
// //     while (generatedCodes.size < count) {
// //       let randomPart = "";
// //       for (let i = 0; i < codeLength; i++) {
// //         randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
// //       }
// //       const fullCode = (prefix.toUpperCase() + randomPart).substring(0, 20);
// //       generatedCodes.add(fullCode);
// //     }

// //     const couponsArray = [];
// //     for (const code of generatedCodes) {
// //       couponsArray.push({
// //         code, discountType, discountValue: discountValue || 0,
// //         maxDiscountCap: maxDiscountCap || null, minOrderValue: minOrderValue || 0,
// //         validFrom: validFrom || new Date(), validTill,
// //         usageLimit: 1, // BULK RULE: 1 specific code can be used 1 time only globally
// //         perUserLimit: 1, // BULK RULE: 1 user can use 1 code 1 time
// //         description: description || "Bulk Generated Coupon",
// //         tag: tag || "Bulk",
// //         isBulk: true,
// //         batchId
// //       });
// //     }

// //     // Insert safely in DB
// //     const result = await Coupon.insertMany(couponsArray, { ordered: false });

// //     res.status(201).json({
// //       success: true,
// //       message: `Successfully generated ${result.length} coupons`,
// //       batchId
// //     });
// //   } catch (err) {
// //     // If ordered: false, it will still insert non-duplicates even if some clash
// //     if (err.code === 11000) {
// //       res.status(201).json({
// //         success: true,
// //         message: "Generated coupons (some skipped due to code collision)",
// //         batchId: req.body.batchId || `BATCH-${Date.now()}`
// //       });
// //     } else {
// //       res.status(500).json({ success: false, message: err.message });
// //     }
// //   }
// // };



// exports.exportBulkCoupons = async (req, res) => {
//   try {
//     const { batchId } = req.params;
    
//     // -------------------------------------------------------------
//     // 🔥 NAYA CODE: Pata karein ki batch abhi process ho raha hai ya nahi
//     // -------------------------------------------------------------
//     const pendingCouponsCount = await Coupon.countDocuments({ 
//       batchId, 
//       isProcessed: false // Jo abhi tak send/fail nahi hue
//     });

//     // Agar abhi bhi background job chal rahi hai, toh Export rok do
//     if (pendingCouponsCount > 0) {
//       return res.status(400).json({ 
//         success: false, 
//         message: `WhatsApp broadcast is still running in the background. Please wait a few minutes before exporting. (${pendingCouponsCount} messages left)` 
//       });
//     }
//     // -------------------------------------------------------------

//     // Agar saare process ho gaye hain, tabhi CSV generate hoga
//     const coupons = await Coupon.find({ batchId }).select(
//       "code discountType discountValue minOrderValue validTill isActive usedCount usageLimit isSent -_id"
//     );

//     if (!coupons.length) {
//       return res.status(404).json({ success: false, message: "No coupons found for this batch" });
//     }

//     let csv = "Code,Discount Type,Discount Value,Min Order,Valid Till,Status,Usage,Sent Status\n";
    
//     coupons.forEach(c => {
//       const status = c.isActive ? "Active" : "Disabled";
//       const sentStatus = c.isSent ? "Sent ✅" : "Not Sent ❌";

//       csv += `${c.code},${c.discountType},${c.discountValue},${c.minOrderValue},${new Date(c.validTill).toLocaleDateString("en-IN")},${status},${c.usedCount}/${c.usageLimit},${sentStatus}\n`;
//     });

//     res.header("Content-Type", "text/csv");
//     res.attachment(`coupons-${batchId}.csv`);
//     return res.send(csv);
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// // ─────────────────────────────────────────────
// // ADMIN: Get all coupons (with usage stats)
// // ─────────────────────────────────────────────
// exports.getAllCoupons = async (req, res) => {
//   try {
//     // Fetching max 1000 newest in the table to prevent frontend crash
//     const coupons = await Coupon.find({ isDeleted: false })
//       .sort({ createdAt: -1 })
//       .limit(1000); 

//     const couponIds = coupons.map((c) => c._id);
//     const usageCounts = await CouponUsage.aggregate([
//       { $match: { coupon: { $in: couponIds } } },
//       { $group: { _id: "$coupon", count: { $sum: 1 } } },
//     ]);

//     const usageMap = {};
//     usageCounts.forEach((u) => { usageMap[u._id.toString()] = u.count; });

//     const result = coupons.map((c) => ({
//       ...c.toObject(), actualUsageCount: usageMap[c._id.toString()] || 0,
//     }));

//     res.json({ success: true, coupons: result });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };


// // ─────────────────────────────────────────────
// // ADMIN: Update coupon
// // ─────────────────────────────────────────────
// exports.updateCoupon = async (req, res) => {
//   try {
//     const { id } = req.params;

//     // Don't allow changing the code itself (unique identifier)
//     delete req.body.code;
//     delete req.body.usedCount;

//     const coupon = await Coupon.findByIdAndUpdate(
//       id,
//       { ...req.body },
//       { new: true, runValidators: true }
//     );

//     if (!coupon) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Coupon not found" });
//     }

//     res.json({ success: true, coupon });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// // ─────────────────────────────────────────────
// // ADMIN: Toggle active status
// // ─────────────────────────────────────────────
// exports.toggleCoupon = async (req, res) => {
//   try {
//     const coupon = await Coupon.findById(req.params.id);
//     if (!coupon) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Coupon not found" });
//     }
//     coupon.isActive = !coupon.isActive;
//     await coupon.save();
//     res.json({
//       success: true,
//       message: `Coupon ${coupon.isActive ? "enabled" : "disabled"}`,
//       coupon,
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// // ─────────────────────────────────────────────
// // ADMIN: Soft delete coupon
// // ─────────────────────────────────────────────
// exports.deleteCoupon = async (req, res) => {
//   try {
//     const coupon = await Coupon.findByIdAndUpdate(
//       req.params.id,
//       { isDeleted: true, isActive: false },
//       { new: true }
//     );
//     if (!coupon) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Coupon not found" });
//     }
//     res.json({ success: true, message: "Coupon deleted" });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };



// // ─────────────────────────────────────────────
// // ADMIN: Delete entire batch of bulk coupons
// // ─────────────────────────────────────────────
// exports.deleteBulkBatch = async (req, res) => {
//   try {
//     const { batchId } = req.params;

//     if (!batchId) {
//       return res.status(400).json({ success: false, message: "batchId is required" });
//     }

//     const result = await Coupon.updateMany(
//       { batchId, isDeleted: false },
//       { isDeleted: true, isActive: false }
//     );

//     if (result.matchedCount === 0) {
//       return res.status(404).json({ success: false, message: "No coupons found for this batch" });
//     }

//     res.json({
//       success: true,
//       message: `${result.modifiedCount} coupons from batch deleted successfully`,
//       deletedCount: result.modifiedCount,
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// // ─────────────────────────────────────────────
// // ADMIN: Usage report for one coupon
// // ─────────────────────────────────────────────
// exports.getCouponUsageReport = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const usages = await CouponUsage.find({ coupon: id })
//       .populate("user", "fullName email")
//       .populate("orderId", "orderNumber total")
//       .sort({ createdAt: -1 });

//     const totalDiscount = usages.reduce(
//       (sum, u) => sum + u.discountApplied,
//       0
//     );

//     res.json({
//       success: true,
//       totalUses: usages.length,
//       totalDiscountGiven: totalDiscount,
//       usages,
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// // ─────────────────────────────────────────────
// // USER: Get all available/active coupons
// // ─────────────────────────────────────────────
// exports.getActiveCoupons = async (req, res) => {
//   try {
//     const now = new Date();
//     const coupons = await Coupon.find({
//       isActive: true,
//       isDeleted: false,
//       isBulk: false,
//       validFrom: { $lte: now },
//       validTill: { $gte: now },
//     }).select(
//       "code discountType discountValue maxDiscountCap minOrderValue validTill description tag"
//     );

//     res.json({ success: true, coupons });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// // ─────────────────────────────────────────────
// // USER: Validate & apply coupon
// // ─────────────────────────────────────────────


// exports.validateCoupon = async (req, res) => {
//   try {
//     console.log(".......................",req.body)
//     const { code, orderTotal } = req.body;
//     const userId = req.userId;
//     console.log("this is a idddd .......................",userId)

//     if (!code || !orderTotal) {
//       return res.status(400).json({ 
//         success: false, 
//         message: "Code and orderTotal are required" 
//       });
//     }

//     const now = new Date();
//     const coupon = await Coupon.findOne({
//       code: code.toUpperCase(),
//       isDeleted: false,
//     });

//     // 1. Exists?
//     if (!coupon) {
//       return res.status(404).json({ success: false, message: "Invalid coupon code" });
//     }

//     // 2. Active?
//     if (!coupon.isActive) {
//       return res.status(400).json({ success: false, message: "This coupon is no longer active" });
//     }

//     // 3. Expired?
//     if (now < coupon.validFrom || now > coupon.validTill) {
//       return res.status(400).json({ success: false, message: "Coupon has expired" });
//     }

//     // 4. Minimum order?
//     if (orderTotal < coupon.minOrderValue) {
//       return res.status(400).json({
//         success: false,
//         message: `Add ₹${coupon.minOrderValue - orderTotal} more to use this coupon`,
//       });
//     }

//     // 5. Global usage limit?
//     if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
//       return res.status(400).json({ success: false, message: "Coupon usage limit reached" });
//     }

//     // 6. Per-user limit (for this specific code)?
//     const userUsageCount = await CouponUsage.countDocuments({
//       coupon: coupon._id,
//       user: userId,
//     });
    
//     if (userUsageCount >= coupon.perUserLimit) {
//       return res.status(400).json({
//         success: false,
//         message: "You have already used this coupon",
//       });
//     }

//     // ─────────────────────────────────────────────
//     // 6.5 BATCH ID LIMIT CHECK (NEW LOGIC)
//     // ─────────────────────────────────────────────
//     if (coupon.isBulk && coupon.batchId) {
//       // Step A: Find all coupon IDs that this user has used in the past
//       const previousUsages = await CouponUsage.find({ user: userId }).select("coupon");
//       const usedCouponIds = previousUsages.map((usage) => usage.coupon);

//       // Step B: Check if any of those used coupons share the same batchId
//       if (usedCouponIds.length > 0) {
//         const usedFromSameBatch = await Coupon.findOne({
//           _id: { $in: usedCouponIds },
//           batchId: coupon.batchId
//         });

//         if (usedFromSameBatch) {
//           return res.status(400).json({
//             success: false,
//             message: "You have already used a coupon from this promotional batch.",
//           });
//         }
//       }
//     }
//     // ─────────────────────────────────────────────

//     // 7. Calculate discount
//     let discount = 0;
//     if (coupon.discountType === "flat") {
//       discount = coupon.discountValue;
//     } else if (coupon.discountType === "percentage") {
//       discount = Math.round((orderTotal * coupon.discountValue) / 100);
//       if (coupon.maxDiscountCap) {
//         discount = Math.min(discount, coupon.maxDiscountCap);
//       }
//     } else if (coupon.discountType === "free_delivery") {
//       discount = 0; // delivery fee waived on order creation
//     }

//     // Cap discount to order total (so discount is never more than order amount)
//     discount = Math.min(discount, orderTotal);

//     res.json({
//       success: true,
//       discount,
//       coupon: {
//         code: coupon.code,
//         discountType: coupon.discountType,
//         freeDelivery: coupon.discountType === "free_delivery",
//       },
//       message: `Coupon applied! You save ₹${discount}`,
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };