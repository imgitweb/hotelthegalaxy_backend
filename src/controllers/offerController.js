const Offer = require("../models/Offer");
const MenuItem = require("../models/dining/menuItemmodel");
const Combo = require("../models/dining/combomodel");
const User = require("../models/User"); // 🔥 NEW: User model import kiya for fetching phone numbers
const { sendOfferTemplate } = require("../utils/whatsaap/sendOfferTemplate");

const uploadToCloudinary = require("../utils/cloudUpload");
const cloudinary = require("../config/cloudinary");

const { getFinalPrice } = require("../services/priceService");

// 🔥 NEW: Background function to broadcast WhatsApp messages
const sendOfferToAllUsers = async (offerData) => {
  try {
    // 1. Get all active users with phone numbers
    const users = await User.find({ phone: { $exists: true, $ne: null } }).select("phone fullName");
    
    // 2. Format discount text
    const discountText = offerData.discountType === "percentage" 
      ? `${offerData.discountValue}% OFF` 
      : `Flat ₹${offerData.discountValue} OFF`;

    // 3. Format dates to Indian standard readable format
    const startDate = new Date(offerData.startDate).toLocaleDateString("en-IN");
    const endDate = new Date(offerData.endDate).toLocaleDateString("en-IN");

    // 4. Send messages to all users
    for (const user of users) {
      let formattedPhone = user.phone.toString().replace(/\D/g, '');
      if (formattedPhone.length === 10) formattedPhone = "91" + formattedPhone;

      // Call the template function
      await sendOfferTemplate(formattedPhone, {
        imageUrl: offerData.image.url,
        userName: user.fullName || "Guest",
        offerName: offerData.name,
        discountText: discountText,
        startDate: startDate,
        endDate: endDate
      });
    }
  } catch (error) {
    console.error("Error in background WhatsApp broadcast:", error);
  }
};

const getMenuItems = async (req, res) => {
  try {
    const items = await MenuItem.find().lean();

    const result = [];

    for (const item of items) {
      const priceData = await getFinalPrice(item, "item");

      result.push({
        ...item,
        ...priceData,
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getCombos = async (req, res) => {
  try {
    const combos = await Combo.find().lean();

    const result = [];

    for (const combo of combos) {
      const priceData = await getFinalPrice(combo, "combo");

      result.push({
        ...combo,
        ...priceData,
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const createOffer = async (req, res) => {
  try {
    let items = [];
    let combos = [];

    if (req.body.items) items = JSON.parse(req.body.items);
    if (req.body.combos) combos = JSON.parse(req.body.combos);

    let imageData = {};

    if (req.file) {
      const uploaded = await uploadToCloudinary(req.file.buffer, "offers");

      imageData = {
        url: uploaded.secure_url,
        public_id: uploaded.public_id,
      };
    }

    const offer = await Offer.create({
      name: req.body.name,
      discountType: req.body.discountType,
      discountValue: req.body.discountValue,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      items,
      combos,
      image: imageData,
    });

    // 🔥 NEW: Trigger WhatsApp message broadcast in background
    // Sirf tab bhejein jab image upload hui ho, kyunki template mein header image mandatory hai
    if (imageData.url) {
        sendOfferToAllUsers(offer); // Note: Await nahi lagaya taaki API response slow na ho
    }

    res.status(201).json({
      success: true,
      data: offer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// const getOffers = async (req, res) => {
//   try {
//     const offers = await Offer.find()
//       .populate("items")
//       .populate("combos")
//       .sort({ createdAt: -1 })
//       .lean();

//     const result = [];

//     for (const offer of offers) {
//       const itemsWithPrice = [];

//       for (const item of offer.items) {
//         const priceData = await getFinalPrice(item, "item");

//         itemsWithPrice.push({
//           ...item,
//           ...priceData,
//         });
//       }

//       const combosWithPrice = [];

//       for (const combo of offer.combos) {
//         const priceData = await getFinalPrice(combo, "combo");

//         combosWithPrice.push({
//           ...combo,
//           ...priceData,
//         });
//       }

//       result.push({
//         ...offer,
//         items: itemsWithPrice,
//         combos: combosWithPrice,
//       });
//     }

//     res.json({
//       success: true,
//       data: result,
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };

const getOfferById = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id)
      .populate("items")
      .populate("combos")
      .lean();

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    res.json({
      success: true,
      data: offer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateOffer = async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (req.body.items) updateData.items = JSON.parse(req.body.items);
    if (req.body.combos) updateData.combos = JSON.parse(req.body.combos);

    if (req.file) {
      const uploaded = await uploadToCloudinary(req.file.buffer, "offers");

      updateData.image = {
        url: uploaded.secure_url,
        public_id: uploaded.public_id,
      };
    }

    const offer = await Offer.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    })
      .populate("items")
      .populate("combos")
      .lean();

    res.json({
      success: true,
      data: offer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// const deleteOffer = async (req, res) => {
//   try {
//     const offer = await Offer.findById(req.params.id);

//     if (!offer) {
//       return res.status(404).json({
//         success: false,
//         message: "Offer not found",
//       });
//     }

//     if (offer.image?.public_id) {
//       await cloudinary.uploader.destroy(offer.image.public_id);
//     }

//     await offer.deleteOne();

//     res.json({
//       success: true,
//       message: "Offer deleted successfully",
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };
// User-facing: sirf active offers
const getActiveOffers = async (req, res) => {
  try {
    const now = new Date();
    const offers = await Offer.find({
      isActive: true,
      isDeleted: false,
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
      .populate("items")
      .populate("combos")
      .sort({ createdAt: -1 })
      .lean();

    // ... same price logic jo abhi hai
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const toggleOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ success: false, message: "Offer not found" });

    offer.isActive = !offer.isActive;
    await offer.save();

    res.json({ success: true, data: offer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ success: false, message: "Offer not found" });

    offer.isDeleted = true;
    offer.isActive = false;
    await offer.save();

    res.json({ success: true, message: "Offer soft deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
const restoreOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ success: false, message: "Offer not found" });

    offer.isDeleted = false;
    await offer.save();

    res.json({ success: true, data: offer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// const getOffers = async (req, res) => {
//   try {
//     const { showDeleted } = req.query;
//     const filter = showDeleted === "true" ? { isDeleted: true } : { isDeleted: false };

//     const offers = await Offer.find(filter)
//       .populate("items")
//       .populate("combos")
//       .sort({ createdAt: -1 })
//       .lean();

//     const result = []; // ← yeh line missing thi

//     for (const offer of offers) {
//       const itemsWithPrice = [];
//       for (const item of offer.items) {
//         const priceData = await getFinalPrice(item, "item");
//         itemsWithPrice.push({ ...item, ...priceData });
//       }

//       const combosWithPrice = [];
//       for (const combo of offer.combos) {
//         const priceData = await getFinalPrice(combo, "combo");
//         combosWithPrice.push({ ...combo, ...priceData });
//       }

//       result.push({
//         ...offer,
//         items: itemsWithPrice,
//         combos: combosWithPrice,
//       });
//     }

//     res.json({ success: true, data: result });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

const getOffers = async (req, res) => {
  try {
    const { showDeleted } = req.query;
    const filter = showDeleted === "true" ? { isDeleted: true } : { isDeleted: false };

    const offers = await Offer.find(filter)
      .populate("items")
      .populate("combos")
      .sort({ createdAt: -1 })
      .lean();

    const result = [];

    for (const offer of offers) {
      const itemsWithPrice = [];
      let totalOriginal = 0;
      let totalAfterDiscount = 0;

      // ── Items ──
      for (const item of offer.items) {
        const priceData = await getFinalPrice(item, "item");
        const originalPrice = priceData.finalPrice || priceData.price || 0;

        const discountedPrice =
          offer.discountType === "PERCENTAGE"
            ? originalPrice - (originalPrice * offer.discountValue) / 100
            : Math.max(0, originalPrice - offer.discountValue);

        const savedAmount = originalPrice - discountedPrice;

        totalOriginal += originalPrice;
        totalAfterDiscount += discountedPrice;

        itemsWithPrice.push({
          ...item,
          ...priceData,
          originalPrice,
          discountedPrice: Math.round(discountedPrice),
          savedAmount: Math.round(savedAmount),
        });
      }

      // ── Combos ──
      const combosWithPrice = [];
      for (const combo of offer.combos) {
        const priceData = await getFinalPrice(combo, "combo");
        const originalPrice = priceData.finalPrice || priceData.price || 0;

        const discountedPrice =
          offer.discountType === "PERCENTAGE"
            ? originalPrice - (originalPrice * offer.discountValue) / 100
            : Math.max(0, originalPrice - offer.discountValue);

        const savedAmount = originalPrice - discountedPrice;

        totalOriginal += originalPrice;
        totalAfterDiscount += discountedPrice;

        combosWithPrice.push({
          ...combo,
          ...priceData,
          originalPrice,
          discountedPrice: Math.round(discountedPrice),
          savedAmount: Math.round(savedAmount),
        });
      }

      result.push({
        ...offer,
        items: itemsWithPrice,
        combos: combosWithPrice,
        summary: {
          totalOriginal: Math.round(totalOriginal),
          totalAfterDiscount: Math.round(totalAfterDiscount),
          totalSaved: Math.round(totalOriginal - totalAfterDiscount),
        },
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
   getMenuItems, getCombos,
  createOffer, getOffers, getActiveOffers,
  getOfferById, updateOffer, deleteOffer,
  toggleOffer, restoreOffer,

};