const MenuService = require("../../services/dining/menuService");
const uploadToCloudinary = require("../../utils/cloudUpload");

const create = async (req, res) => {
  try {
    let imageUrls = [];

    if (req.files?.length) {
      for (const file of req.files) {
        const result = await uploadToCloudinary(file.buffer, "menu_items");
        imageUrls.push({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    }

    const item = await MenuService.create({
      ...req.body,
      images: imageUrls,
      isVeg: req.body.isVeg !== "false",
      basePrice: Number(req.body.basePrice),
      preparationTime: Number(req.body.preparationTime || 15),
    });

    return res.status(201).json({
      success: true,
      message: "Menu item created successfully",
      data: item,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getAll = async (req, res) => {
  try {
    const items = await MenuService.getAll(req.query);
    return res.json({ success: true, data: items });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getById = async (req, res) => {
  try {
    const item = await MenuService.getById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    return res.json({ success: true, data: item });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const update = async (req, res) => {
  try {
    let imageUrls = [];
    const updatedData = { ...req.body };

    if (req.files?.length) {
      for (const file of req.files) {
        const result = await uploadToCloudinary(file.buffer, "menu_items");
        imageUrls.push({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
      updatedData.images = imageUrls;
    }

    if (req.body.basePrice !== undefined) {
      updatedData.basePrice = Number(req.body.basePrice);
    }

    if (req.body.preparationTime !== undefined) {
      updatedData.preparationTime = Number(req.body.preparationTime);
    }

    if (req.body.isVeg !== undefined) {
      updatedData.isVeg = req.body.isVeg !== "false";
    }

    const item = await MenuService.update(req.params.id, updatedData);

    return res.json({
      success: true,
      message: "Menu updated successfully",
      data: item,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const remove = async (req, res) => {
  try {
    const item = await MenuService.update(req.params.id, {
      isDeleted: true,
      deletedAt: new Date(),
      isAvailable: false,
    });

    return res.json({
      success: true,
      message: "Menu item removed successfully",
      data: item,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const restore = async (req, res) => {
  try {
    const item = await MenuService.update(req.params.id, {
      isDeleted: false,
      deletedAt: null,
      isAvailable: true,
    });

    return res.json({
      success: true,
      message: "Menu restored successfully",
      data: item,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const toggleAvailability = async (req, res) => {
  try {
    const { isAvailable, reason } = req.body;

    const item = await MenuService.update(req.params.id, {
      isAvailable,
      availabilityReason: reason || "MANUAL",
    });

    return res.json({
      success: true,
      message: "Availability updated",
      data: item,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const bulkUpdate = async (req, res) => {
  try {
    const result = await MenuService.bulkUpdate(req.body);

    return res.json({
      success: true,
      message: "Bulk update completed",
      data: result,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  create,
  getAll,
  getById,
  update,
  remove,
  restore,
  toggleAvailability,
  bulkUpdate,
};