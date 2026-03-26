const Category = require("../../models/dining/diningCategorymodel");

exports.getCategoriesForUsers = async (req, res, next) => {
  try {
    const categories = await Category.find({
      isActive: true,
      isDeleted: { $ne: true },
    })
      .select("name image")
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (err) {
    next(err);
  }
};
