// controllers/admin/departmentController.js
const Department = require("../../models/departmentModel");

// GET - Saare active departments
exports.getDepartments = async (req, res, next) => {
  try {
    const departments = await Department.find({ isDeleted: false, isActive: true })
      .sort({ name: 1 });

    return res.json({ success: true, data: departments });
  } catch (err) {
    next(err);
  }
};

// POST - Naya department create karo
exports.createDepartment = async (req, res, next) => {
  try {
    const { name, roles } = req.body;

    if (!name || !roles || roles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Department name and at least one role required",
      });
    }

    const existing = await Department.findOne({
      name: name.toUpperCase().trim(),
      isDeleted: false,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Department already exists",
      });
    }

    const dept = await Department.create({
      name: name.toUpperCase().trim(),
      roles: roles.map((r) => r.trim()).filter(Boolean),
    });

    return res.status(201).json({ success: true, data: dept });
  } catch (err) {
    next(err);
  }
};

// PUT - Department update karo (name ya roles)
exports.updateDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, roles } = req.body;

    const dept = await Department.findOneAndUpdate(
      { _id: id, isDeleted: false },
      {
        ...(name && { name: name.toUpperCase().trim() }),
        ...(roles && { roles: roles.map((r) => r.trim()).filter(Boolean) }),
      },
      { new: true, runValidators: true }
    );

    if (!dept) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }

    return res.json({ success: true, data: dept });
  } catch (err) {
    next(err);
  }
};

// DELETE - Soft delete
exports.deleteDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const dept = await Department.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );

    if (!dept) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }

    return res.json({ success: true, message: "Department deleted" });
  } catch (err) {
    next(err);
  }
};

