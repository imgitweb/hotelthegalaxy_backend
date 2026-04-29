const Staff = require("../../models/staffModel");
const Rider = require("../../models/rider.model"); // Rider model import
const mongoose = require("mongoose");


const Department = require("../../models/departmentModel");


exports.createStaff = async (req, res, next) => {
  try {
    const { name, phone, department, role, shift } = req.body;

    if (!name || !phone || !department || !role) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // ✅ Dynamic validation - DB se check karo
    const dept = await Department.findOne({
      name: department,
      isDeleted: false,
      isActive: true,
    });

    if (!dept) {
      return res.status(400).json({
        success: false,
        message: "Invalid department selected",
      });
    }

    if (!dept.roles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role for department ${department}`,
      });
    }

    const existingStaff = await Staff.findOne({ phone });
    if (existingStaff) {
      return res.status(409).json({
        success: false,
        message: "Staff already exists with this phone",
      });
    }

    const existingRider = await Rider.findOne({ phone });
    if (existingRider) {
      return res.status(409).json({
        success: false,
        message: "This number is already registered as a Rider",
      });
    }

    const staff = await Staff.create({ name, phone, department, role, shift });

    return res.status(201).json({ success: true, data: staff });
  } catch (err) {
    console.error("❌ createStaff Error:", err);
    next(err);
  }
};

// getStaff, updateStaff, deleteStaff, getSingleStaff - same rahenge




exports.getStaff = async (req, res, next) => {
  try {
    // Frontend se page, limit, search aur department parameters aayenge
    let { page = 1, limit = 20, search = "", department = "" } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    // Default query: Sirf active staff
    const query = { isDeleted: false };

    // Agar search param hai, toh Name ya Phone se filter karega
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    // Agar department filter select kiya gaya hai
    if (department && department !== "All") {
      query.department = department;
    }

    // Pagination aur Sorting ke saath data fetch
    const staff = await Staff.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Total documents count (Pagination buttons ke liye zaroori hai)
    const total = await Staff.countDocuments(query);

    return res.json({
      success: true,
      data: staff,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      },
    });
  } catch (err) {
    console.error("❌ getStaff Error:", err);
    next(err);
  }
};

// ... (Baki createStaff, updateStaff, deleteStaff pehle jaise hi rahenge)

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

