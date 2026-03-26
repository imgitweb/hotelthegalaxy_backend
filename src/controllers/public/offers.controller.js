const Combo = require("../../models/dining/offer.model");
const uploadToCloudinary = require("../../utils/cloudUpload");
exports.getCombo = async (req, res) => {
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
