const Staff = require("../../models/staffModel");

exports.createStaff = async (req, res, next) => {
  try {
    console.log("📥 CREATE STAFF API HIT");
    console.log("📦 Request Body:", req.body);

    const staff = await Staff.create(req.body);

    console.log("✅ Staff Created:", staff._id);

    res.status(201).json({
      success: true,
      data: staff,
    });
  } catch (err) {
    console.error("❌ Error in createStaff:", err.message);
    next(err);
  }
};

exports.getStaff = async (req, res, next) => {
  try {
    console.log("📥 GET STAFF API HIT");

    const staff = await Staff.find({ isDeleted: false });

    console.log(`📊 Total Staff Found: ${staff.length}`);

    res.json({
      success: true,
      data: staff,
    });
  } catch (err) {
    console.error("❌ Error in getStaff:", err.message);
    next(err);
  }
};

exports.updateStaff = async (req, res, next) => {
  try {
    console.log("📥 UPDATE STAFF API HIT");
    console.log("🆔 Staff ID:", req.params.id);
    console.log("📦 Update Data:", req.body);

    const staff = await Staff.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    console.log("✅ Staff Updated:", staff?._id);

    res.json({
      success: true,
      data: staff,
    });
  } catch (err) {
    console.error("❌ Error in updateStaff:", err.message);
    next(err);
  }
};
 
exports.deleteStaff = async (req, res, next) => {
  try {
    console.log("📥 DELETE STAFF API HIT");
    console.log("🆔 Staff ID:", req.params.id);

    await Staff.findByIdAndUpdate(req.params.id, {
      isDeleted: true,
    });

    console.log("🗑️ Staff Soft Deleted");

    res.json({
      success: true,
      message: "Staff removed",
    });
  } catch (err) {
    console.error("❌ Error in deleteStaff:", err.message);
    next(err);
  }
};
