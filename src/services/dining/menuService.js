const MenuItem = require("../../models/dining/menuItemmodel");
const SubCategory = require("../../models/dining/SubCategory");
const slugify = require("slugify");
const { AppError } = require("../../middleware/errorHandler");

class MenuService {
 
  static async create(data) {
    if (!data.name || !data.basePrice || !data.subCategory) {
      throw new AppError("Required fields missing", 400);
    }

    const subCat = await SubCategory.findOne({
      _id: data.subCategory,
      isDeleted: false,
    });

    if (!subCat) {
      throw new AppError("Invalid SubCategory", 400);
    }

    let baseSlug = slugify(data.name, { lower: true, strict: true });
    let slug = baseSlug;
    let count = 1;

    while (await MenuItem.findOne({ slug, isDeleted: false })) {
      slug = `${baseSlug}-${count++}`;
    }

    return MenuItem.create({ ...data, slug });
  }

  static async getAll(query = {}) {
    const {
      page = 1,
      limit = 100,
      search,
      subCategory,
      isAvailable,
      showDeleted,
    } = query;

    const filter = {};

    if (showDeleted === "all") {
  
    } else if (showDeleted === "true") {
      filter.isDeleted = true;
    } else {
      filter.isDeleted = false;
    }

    if (subCategory) filter.subCategory = subCategory;

    if (isAvailable !== undefined) {
      filter.isAvailable = isAvailable === "true" || isAvailable === true;
    }

    if (search) {
      filter.$text = { $search: search };
    }

    const data = await MenuItem.find(filter)
      .populate({
        path: "subCategory",
        select: "name",
        populate: { path: "category", select: "name" },
      })
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    const total = await MenuItem.countDocuments(filter);

    return {
      data,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    };
  }

  static async getById(id) {
    const item = await MenuItem.findOne({ _id: id, isDeleted: false }).populate({
      path: "subCategory",
      select: "name",
      populate: { path: "category", select: "name" },
    });

    if (!item) throw new AppError("Menu item not found", 404);

    return item;
  }
  static async update(id, data) {

    const item = await MenuItem.findOne({ _id: id, isDeleted: false });

    if (!item) throw new AppError("Menu item not found", 404);

    if (data.name) {
      let baseSlug = slugify(data.name, { lower: true, strict: true });
      let slug = baseSlug;
      let count = 1;

      while (
        await MenuItem.findOne({ slug, _id: { $ne: id }, isDeleted: false })
      ) {
        slug = `${baseSlug}-${count++}`;
      }

      data.slug = slug;
    }

    if (data.subCategory) {
      const subCat = await SubCategory.findOne({
        _id: data.subCategory,
        isDeleted: false,
      });
      if (!subCat) throw new AppError("Invalid SubCategory", 400);
    }

    const updated = await MenuItem.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    );

    return updated;
  }

  static async delete(id) {
 
    const item = await MenuItem.findOneAndUpdate(
      { _id: id, isDeleted: false },  
      {
        $set: {
          isDeleted: true,
          isAvailable: false,
          deletedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!item) throw new AppError("Menu item not found", 404);

    return item;
  }

 
  static async restore(id) {
 
    const item = await MenuItem.findOneAndUpdate(
      { _id: id, isDeleted: true },
      {
        $set: {
          isDeleted: false,
          isAvailable: true,
          deletedAt: null,
        },
      },
      { new: true }
    );

    if (!item) throw new AppError("Menu item not found or already active", 404);

    return item;
  }

  // ✅ BULK UPDATE
  static async bulkUpdate(payload) {
    const { ids, action, value, isAvailable } = payload;

    if (!ids || !ids.length) throw new AppError("No IDs provided", 400);

    const items = await MenuItem.find({ _id: { $in: ids }, isDeleted: false });

    if (!items.length) throw new AppError("Menu items not found", 404);

    if (action === "increasePrice") {
      for (const item of items) {
        item.basePrice += (item.basePrice * value) / 100;
        await item.save();
      }
    } else if (action === "decreasePrice") {
      for (const item of items) {
        item.basePrice -= (item.basePrice * value) / 100;
        if (item.basePrice < 0) item.basePrice = 0;
        await item.save();
      }
    } else if (action === "toggleAvailability") {
      await MenuItem.updateMany(
        { _id: { $in: ids } },
        { isAvailable: isAvailable ?? true, availabilityReason: "MANUAL" }
      );
    } else {
      throw new AppError("Invalid bulk action", 400);
    }

    return { updatedCount: ids.length };
  }
}

module.exports = MenuService;
