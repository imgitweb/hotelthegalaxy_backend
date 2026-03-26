const SubCategory = require("../../models/dining/SubCategory");
const DiningCategory = require("../../models/dining/diningCategorymodel");
  const MenuItem = require("../../models/dining/menuItemmodel");
const slugify = require("slugify");

const create = async (req, res, next) => {
  try {
    const { name, category, sortOrder, isActive } = req.body;

    if (!name || !category) {
      return res.status(400).json({
        success: false,
        message: "Name and Category are required",
      });
    }

    const cat = await DiningCategory.findById(category);
    if (!cat) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const existing = await SubCategory.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
      category,
      isDeleted: false,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "SubCategory already exists",
      });
    }

    const subCategory = await SubCategory.create({
      name,
      category,
      sortOrder: sortOrder ? Number(sortOrder) : 0,
      isActive: isActive !== false && isActive !== "false",
    });

    res.status(201).json({ success: true, data: subCategory });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const update = async (req, res, next) => {
  try {
    const id = req.params.id;

    const subCategory = await SubCategory.findById(id);
    if (!subCategory) {
      return res.status(404).json({
        success: false,
        message: "SubCategory not found",
      });
    }

    if (req.body.name) {
      const duplicate = await SubCategory.findOne({
        name: { $regex: `^${req.body.name}$`, $options: "i" },
        category: subCategory.category,
        _id: { $ne: id },
        isDeleted: false,
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "SubCategory name already exists",
        });
      }

      req.body.slug = slugify(req.body.name, {
        lower: true,
        strict: true,
      });
    }

    if (req.body.sortOrder !== undefined) {
      req.body.sortOrder = Number(req.body.sortOrder);
    }

    if (req.body.isActive !== undefined) {
      req.body.isActive =
        req.body.isActive !== false && req.body.isActive !== "false";
    }

    const updated = await SubCategory.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const remove = async (req, res, next) => {
  try {
    const id = req.params.id;

    const subCategory = await SubCategory.findById(id);

    if (!subCategory || subCategory.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "SubCategory not found",
      });
    }

 // ✅ FIX

    // ✅ FIXED QUERY
    const hasMenu = await MenuItem.findOne({
      subCategory: subCategory._id,
    }).lean();

    if (hasMenu) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete subcategory with active menu items",
      });
    }

    subCategory.isDeleted = true;
    subCategory.deletedAt = new Date();
    subCategory.isActive = false;

    await subCategory.save();

    res.status(200).json({
      success: true,
      message: "SubCategory deleted successfully",
    });
  } catch (error) {
    console.error("DELETE ERROR:", error); // 🔥 IMPORTANT
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getAll = async (req, res, next) => {
  try {
    let { category, page = 1, limit = 10, search } = req.query;

    page = Number(page);
    limit = Number(limit);

    const query = { isDeleted: false };

    if (category) query.category = category;

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const data = await SubCategory.find(query)
      .sort({ sortOrder: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("category", "name");

    const total = await SubCategory.countDocuments(query);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getById = async (req, res, next) => {
  try {
    const subCategory = await SubCategory.findOne({
      _id: req.params.id,
      isDeleted: false,
    })
      .populate("category", "name","")
      .populate({
        path: "menuItems",
        match: { isDeleted: false },
      });

    if (!subCategory) {
      return res.status(404).json({
        success: false,
        message: "SubCategory not found",
      });
    }

    res.status(200).json({ success: true, data: subCategory });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  create,
  update,
  remove,
  getAll,
  getById,
};