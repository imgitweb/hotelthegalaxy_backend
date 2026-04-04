const Offer = require("../models/Offer");
const MenuItem = require("../models/dining/menuItemmodel");
const Combo = require("../models/dining/combomodel");
const sendOfferTemplate = require("../utils/whatsaap/sendOfferTemplate")

const uploadToCloudinary = require("../utils/cloudUpload");
const cloudinary = require("../config/cloudinary");

const { getFinalPrice } = require("../services/priceService");

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

const getOffers = async (req, res) => {
  try {
    const offers = await Offer.find()
      .populate("items")
      .populate("combos")
      .sort({ createdAt: -1 })
      .lean();

    const result = [];

    for (const offer of offers) {
      const itemsWithPrice = [];

      for (const item of offer.items) {
        const priceData = await getFinalPrice(item, "item");

        itemsWithPrice.push({
          ...item,
          ...priceData,
        });
      }

      const combosWithPrice = [];

      for (const combo of offer.combos) {
        const priceData = await getFinalPrice(combo, "combo");

        combosWithPrice.push({
          ...combo,
          ...priceData,
        });
      }

      result.push({
        ...offer,
        items: itemsWithPrice,
        combos: combosWithPrice,
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

const deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    if (offer.image?.public_id) {
      await cloudinary.uploader.destroy(offer.image.public_id);
    }

    await offer.deleteOne();

    res.json({
      success: true,
      message: "Offer deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getMenuItems,
  getCombos,
  createOffer,
  getOffers,
  getOfferById,
  updateOffer,
  deleteOffer,
};
