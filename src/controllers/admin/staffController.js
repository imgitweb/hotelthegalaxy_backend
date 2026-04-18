const Staff = require("../../models/staffModel");
const mongoose = require("mongoose");

exports.createStaff = async (req, res, next) => {
  try {
    const { name, phone, department, role, shift } = req.body;

    if (!name || !phone || !department || !role) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }
    const existing = await Staff.findOne({ phone });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Staff already exists with this phone",
      });
    }

    const staff = await Staff.create({
      name,
      phone,
      department,
      role,
      shift,
    });

    return res.status(201).json({
      success: true,
      data: staff,
    });
  } catch (err) {
    console.error("❌ createStaff Error:", err);
    next(err);
  }
};

exports.getStaff = async (req, res, next) => {
  try {
    let { page = 1, limit = 10, search = "" } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    const query = {
      isDeleted: false,
      $or: [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ],
    };

    const staff = await Staff.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Staff.countDocuments(query);

    return res.json({
      success: true,
      data: staff,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("❌ getStaff Error:", err);
    next(err);
  }
};

exports.updateStaff = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 🧠 ID validation
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Staff ID",
      });
    }

    const staff = await Staff.findOneAndUpdate(
      { _id: id, isDeleted: false },
      req.body,
      { new: true, runValidators: true }
    );

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    return res.json({
      success: true,
      data: staff,
    });
  } catch (err) {
    console.error("❌ updateStaff Error:", err);
    next(err);
  }
};

exports.deleteStaff = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Staff ID",
      });
    }

    const staff = await Staff.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    return res.json({
      success: true,
      message: "Staff removed successfully",
    });
  } catch (err) {
    console.error("❌ deleteStaff Error:", err);
    next(err);
  }
};

exports.getSingleStaff = async (req, res, next) => {
  try {
    const { id } = req.params;

    const staff = await Staff.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    return res.json({
      success: true,
      data: staff,
    });
  } catch (err) {
    console.error("❌ getSingleStaff Error:", err);
    next(err);
  }
};

