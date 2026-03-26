// const MenuItem = require("../../models/dining/menuItemmodel");
// const slugify = require("slugify");
// const { AppError } = require("../../middleware/errorHandler");
// const diningCategorymodel = require("../../models/dining/diningCategorymodel");

// class MenuService {
//   static async create(data) {
//     const slug = slugify(data.name, { lower: true, strict: true });

//     const exists = await MenuItem.findOne({ slug });
//     if (exists) throw new AppError("Menu item already exists", 400);

//     return MenuItem.create({ ...data, slug });
//   }
//   static async getAll(filters = {}) {
//     const categories = await diningCategorymodel
//       .find({ isDeleted: false })
//       .select("_id")
//       .lean();

//     const categoryIds = categories.map((c) => c._id);

//     const menuItems = await MenuItem.find({
//       ...filters,
//       isDeleted: false,
//       category: { $in: categoryIds },
//     })
//       .populate("category")
//       .sort({ createdAt: -1 })
//       .lean();

//     return menuItems;
//   }

//   static async getById(id) {
//     const item = await MenuItem.findOne({
//       _id: id,
//       isDeleted: false,
//     }).populate("category");
//     if (!item) throw new AppError("Menu item not found", 404);
//     return item;
//   }

//   static async update(id, data) {
//     if (data.name) {
//       data.slug = slugify(data.name, { lower: true, strict: true });
//     }

//     const item = await MenuItem.findByIdAndUpdate(id, data, {
//       new: true,
//       runValidators: true,
//     });

//     if (!item) throw new AppError("Menu item not found", 404);
//     return item;
//   }

//   static async toggleAvailability(menuId, isAvailable, reason = "MANUAL") {
//     const item = await MenuItem.findById(menuId);

//     if (!item) {
//       throw new AppError("Menu item not found", 404);
//     }

//     item.isAvailable = isAvailable;
//     item.availabilityReason = reason;

//     await item.save();

//     return item;
//   }

//   static async delete(id) {
//     const item = await MenuItem.findById(id);

//     if (!item || item.isDeleted) {
//       throw new AppError("Menu item not found", 404);
//     }

//     item.isDeleted = true;
//     item.isAvailable = false;

//     await item.save();

//     return item;
//   }
//   static async restore(menuId) {
//     const item = await MenuItem.findById(menuId);

//     if (!item) {
//       throw new AppError("Menu item not found", 404);
//     }

//     item.isDeleted = false;

//     await item.save();

//     return item;
//   }

//   static async bulkUpdate(payload) {
//     const { ids, action, value, isAvailable, categoryId } = payload;

//     if (!ids || !ids.length) {
//       throw new AppError("No menu items selected", 400);
//     }

//     const items = await MenuItem.find({
//       _id: { $in: ids },
//       isDeleted: false,
//     });

//     if (!items.length) {
//       throw new AppError("Menu items not found", 404);
//     }

//     if (action === "increasePrice") {
//       for (const item of items) {
//         item.basePrice += (item.basePrice * value) / 100;
//         await item.save();
//       }
//     } else if (action === "decreasePrice") {
//       for (const item of items) {
//         item.basePrice -= (item.basePrice * value) / 100;
//         if (item.basePrice < 0) item.basePrice = 0;
//         await item.save();
//       }
//     } else if (action === "toggleAvailability") {
//       await MenuItem.updateMany(
//         { _id: { $in: ids } },
//         {
//           isAvailable,
//           availabilityReason: "MANUAL",
//         },
//       );
//     } else if (action === "changeCategory") {
//       await MenuItem.updateMany(
//         { _id: { $in: ids } },
//         { category: categoryId },
//       );
//     } else {
//       throw new AppError("Invalid bulk action", 400);
//     }

//     return { updatedCount: ids.length };
//   }
// }

// module.exports = MenuService;
const MenuItem = require("../../models/dining/menuItemmodel");
const SubCategory = require("../../models/dining/SubCategory");
const slugify = require("slugify");
const { AppError } = require("../../middleware/errorHandler");

class MenuService {

  // ✅ CREATE MENU ITEM
  static async create(data) {
    if (!data.name || !data.basePrice || !data.subCategory) {
      throw new AppError("Required fields missing", 400);
    }

    // ✅ Validate subcategory
    const subCat = await SubCategory.findOne({
      _id: data.subCategory,
      isDeleted: false,
    });

    if (!subCat) {
      throw new AppError("Invalid SubCategory", 400);
    }

    // ✅ Unique slug
    let baseSlug = slugify(data.name, { lower: true, strict: true });
    let slug = baseSlug;
    let count = 1;

    while (
      await MenuItem.findOne({ slug, isDeleted: false })
    ) {
      slug = `${baseSlug}-${count++}`;
    }

    return MenuItem.create({
      ...data,
      slug,
    });
  }

  // ✅ GET ALL (PAGINATION + FILTER + SEARCH)
  static async getAll(query = {}) {
    const {
      page = 1,
      limit = 10,
      search,
      subCategory,
      isAvailable,
    } = query;

    const filter = { isDeleted: false };

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
        populate: {
          path: "category",
          select: "name",
        },
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

  // ✅ GET BY ID
  static async getById(id) {
    const item = await MenuItem.findOne({
      _id: id,
      isDeleted: false,
    }).populate({
      path: "subCategory",
      select: "name",
      populate: {
        path: "category",
        select: "name",
      },
    });

    if (!item) {
      throw new AppError("Menu item not found", 404);
    }

    return item;
  }

  // ✅ UPDATE MENU ITEM
  static async update(id, data) {
    const item = await MenuItem.findById(id);

    if (!item || item.isDeleted) {
      throw new AppError("Menu item not found", 404);
    }

    // ✅ Update slug if name changes
    if (data.name) {
      let baseSlug = slugify(data.name, { lower: true, strict: true });
      let slug = baseSlug;
      let count = 1;

      while (
        await MenuItem.findOne({
          slug,
          _id: { $ne: id },
          isDeleted: false,
        })
      ) {
        slug = `${baseSlug}-${count++}`;
      }

      data.slug = slug;
    }

    // ✅ Validate subcategory
    if (data.subCategory) {
      const subCat = await SubCategory.findOne({
        _id: data.subCategory,
        isDeleted: false,
      });

      if (!subCat) {
        throw new AppError("Invalid SubCategory", 400);
      }
    }

    const updated = await MenuItem.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    );

    return updated;
  }

  // ✅ SOFT DELETE
  static async delete(id) {
    const item = await MenuItem.findById(id);

    if (!item || item.isDeleted) {
      throw new AppError("Menu item not found", 404);
    }

    item.isDeleted = true;
    item.isAvailable = false;

    await item.save();

    return item;
  }

  // ✅ RESTORE
  static async restore(id) {
    const item = await MenuItem.findById(id);

    if (!item) {
      throw new AppError("Menu item not found", 404);
    }

    item.isDeleted = false;
    item.isAvailable = true;

    await item.save();

    return item;
  }

  // ✅ BULK UPDATE (PRODUCTION SAFE)
  static async bulkUpdate(payload) {
    const { ids, action, value, isAvailable } = payload;

    if (!ids || !ids.length) {
      throw new AppError("No IDs provided", 400);
    }

    const items = await MenuItem.find({
      _id: { $in: ids },
      isDeleted: false,
    });

    if (!items.length) {
      throw new AppError("Menu items not found", 404);
    }

    // 🔥 PRICE INCREASE
    if (action === "increasePrice") {
      for (const item of items) {
        item.basePrice += (item.basePrice * value) / 100;
        await item.save();
      }
    }

    // 🔥 PRICE DECREASE
    else if (action === "decreasePrice") {
      for (const item of items) {
        item.basePrice -= (item.basePrice * value) / 100;
        if (item.basePrice < 0) item.basePrice = 0;
        await item.save();
      }
    }

    // 🔥 TOGGLE AVAILABILITY
    else if (action === "toggleAvailability") {
      await MenuItem.updateMany(
        { _id: { $in: ids } },
        {
          isAvailable: isAvailable ?? true,
          availabilityReason: "MANUAL",
        }
      );
    }

    else {
      throw new AppError("Invalid bulk action", 400);
    }

    return { updatedCount: ids.length };
  }
}

module.exports = MenuService;