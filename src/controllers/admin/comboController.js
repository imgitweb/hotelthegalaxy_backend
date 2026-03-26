const Combo = require("../../models/dining/combomodel");
const uploadToCloudinary = require("../../utils/cloudUpload");

const createCombo = async (req, res) => {
  try {
    let { name, price, items, description } = req.body;

    if (!name || !price) {
      return res.status(400).json({
        success: false,
        message: "Name and price required",
      });
    }

    if (!items) {
      return res.status(400).json({
        success: false,
        message: "Items required",
      });
    }

    if (typeof items === "string") {
      items = JSON.parse(items);
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items required",
      });
    }

    let imageUrls = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await uploadToCloudinary(file.buffer, "combo_items");

        imageUrls.push({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    }

    const combo = await Combo.create({
      name,
      price: Number(price),
      description,
      items,
      images: imageUrls,
    });

    res.status(201).json({
      success: true,
      message: "Combo created successfully",
      data: combo,
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
    const combos = await Combo.find()
      .populate("items.item")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: combos,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateCombo = async (req, res) => {
  try {
    let { name, price, items, description } = req.body;

    const combo = await Combo.findById(req.params.id);

    if (!combo) {
      return res.status(404).json({
        success: false,
        message: "Combo not found",
      });
    }

    if (typeof items === "string") {
      items = JSON.parse(items);
    }

    let imageUrls = combo.images || [];

    if (req.files && req.files.length > 0) {
      imageUrls = [];

      for (const file of req.files) {
        const result = await uploadToCloudinary(file.buffer, "combo_items");

        imageUrls.push({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    }

    combo.name = name || combo.name;
    combo.price = price ? Number(price) : combo.price;
    combo.description = description || combo.description;
    combo.items = items || combo.items;
    combo.images = imageUrls;

    await combo.save();

    res.json({
      success: true,
      message: "Combo updated successfully",
      data: combo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const deleteCombo = async (req, res) => {
  try {
    const combo = await Combo.findByIdAndDelete(req.params.id);

    if (!combo) {
      return res.status(404).json({
        success: false,
        message: "Combo not found",
      });
    }

    res.json({
      success: true,
      message: "Combo deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createCombo,
  getCombos,
  updateCombo,
  deleteCombo,
};
