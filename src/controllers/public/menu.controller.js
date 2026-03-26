const DailyRoster = require("../../models/dining/DailyRoster");
const Menu = require("../../models/dining/menuItemmodel");
const Review = require("../../models/reviewModel");
const mongoose = require("mongoose");

// exports.getMenuForUsers = async (req, res, next) => {
//   try {
//     const start = new Date();
//     start.setHours(0, 0, 0, 0);

//     const end = new Date();
//     end.setHours(23, 59, 59, 999);

//     const roster = await DailyRoster.find({
//       date: { $gte: start, $lte: end },
//     })

//       .populate({
//         path: "items.id",
//         select:
//           "name basePrice images isVeg isJain description preparationTime spiceLevel subCategory",
//         populate: {
//           path: "subCategory",
//           select: "name category",
//           populate: {
//             path: "category",
//             select: "name",
//           },
//         },
//       })
//       .lean();

//     let menu = [];

//     if (roster.length) {
//       menu = roster.flatMap((r) =>
//         r.items
//           .filter((item) => item.quantity > 0 && item.id)
//           .map((item) => ({
//             _id: item.id._id,
//             name: item.id.name,
//             basePrice: item.id.basePrice,
//             images: item.id.images,
//             isVeg: item.id.isVeg,
//             isJain: item.id.isJain,
//             description: item.id.description,
//             preparationTime: item.id.preparationTime,
//             spiceLevel: item.id.spiceLevel,
//             category: item.id.category,
//             quantity: item.quantity,
//           })),
//       );
//     } else {
//       const fallbackMenu = await Menu.find({
//         isAvailable: true,
//         isArchived: { $ne: true },
//       })
//         .populate("category", "name")
//         .select(
//           "name basePrice images isVeg isJain description preparationTime spiceLevel category",
//         )
//         .lean();

//       menu = fallbackMenu.map((item) => ({
//         _id: item._id,
//         name: item.name,
//         basePrice: item.basePrice,
//         images: item.images,
//         isVeg: item.isVeg,
//         isJain: item.isJain,
//         description: item.description,
//         preparationTime: item.preparationTime,
//         spiceLevel: item.spiceLevel,
//         category: item.category,
//         quantity: null,
//       }));
//     }

//     const menuIds = menu.map((m) => new mongoose.Types.ObjectId(m._id));

//     const ratings = await Review.aggregate([
//       {
//         $match: {
//           menuItem: { $ne: null },
//           rating: { $ne: null },
//         },
//       },
//       {
//         $group: {
//           _id: "$menuItem",
//           avgRating: { $avg: "$rating" },
//           totalReviews: { $sum: 1 },
//         },
//       },
//     ]);

//     const ratingMap = {};

//     ratings.forEach((r) => {
//       ratingMap[r._id.toString()] = {
//         avgRating: Number(r.avgRating.toFixed(1)),
//         totalReviews: r.totalReviews,
//       };
//     });

//     const finalMenu = menu.map((item) => {
//       const ratingData = ratingMap[item._id.toString()] || {
//         avgRating: 0,
//         totalReviews: 0,
//       };

//       return {
//         ...item,
//         rating: ratingData.avgRating,
//         reviewCount: ratingData.totalReviews,
//       };
//     });

//     res.status(200).json({
//       success: true,
//       data: finalMenu,
//     });
//   } catch (err) {
//     next(err);
//   }
// };

// exports.getDailyRosterMenu = async (req, res, next) => {
//   try {
//     const start = new Date();
//     start.setHours(0, 0, 0, 0);

//     const end = new Date();
//     end.setHours(23, 59, 59, 999);

//     const roster = await DailyRoster.find({
//       date: { $gte: start, $lte: end },
//     })
//       .populate({
//         path: "items.id",
//         select:
//           "name basePrice images isVeg isJain description preparationTime spiceLevel category",
//         populate: {
//           path: "category",
//           select: "name",
//         },
//       })
//       .lean();

//     if (!roster.length) {
//       return res.status(200).json({
//         success: true,
//         data: [],
//       });
//     }

//     const menu = roster.flatMap((r) =>
//       r.items
//         .filter((item) => item.quantity > 0 && item.id)
//         .map((item) => ({
//           _id: item.id._id,
//           name: item.id.name,
//           basePrice: item.id.basePrice,
//           images: item.id.images,
//           isVeg: item.id.isVeg,
//           isJain: item.id.isJain,
//           description: item.id.description,
//           preparationTime: item.id.preparationTime,
//           spiceLevel: item.id.spiceLevel,
//           category: item.id.category,
//           quantity: item.quantity,
//         })),
//     );

//     res.status(200).json({
//       success: true,
//       data: menu,
//     });
//   } catch (err) {
//     next(err);
//   }
// };



exports.getMenuForUsers = async (req, res, next) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const roster = await DailyRoster.find({
      date: { $gte: start, $lte: end },
    })
      .populate({
        path: "items.id",
        select:
          "name basePrice images isVeg isJain description preparationTime spiceLevel subCategory",
        populate: {
          path: "subCategory",
          select: "name category",
          populate: {
            path: "category",
            select: "name",
          },
        },
      })
      .lean();

    let menu = [];

    if (roster.length) {
      menu = roster.flatMap((r) =>
        r.items
          .filter((item) => item.quantity > 0 && item.id)
          .map((item) => ({
            _id: item.id._id,
            name: item.id.name,
            basePrice: item.id.basePrice,
            images: item.id.images,
            isVeg: item.id.isVeg,
            isJain: item.id.isJain,
            description: item.id.description,
            preparationTime: item.id.preparationTime,
            spiceLevel: item.id.spiceLevel,

            // ✅ FIXED
            category: item.id.subCategory?.category?.name || null,
            subCategory: item.id.subCategory?.name || null,

            quantity: item.quantity,
          })),
      );
    } else {
      const fallbackMenu = await Menu.find({
        isAvailable: true,
        isDeleted: false,
      })
        .populate({
          path: "subCategory",
          select: "name category",
          populate: {
            path: "category",
            select: "name",
          },
        })
        .select(
          "name basePrice images isVeg isJain description preparationTime spiceLevel subCategory",
        )
        .lean();

      menu = fallbackMenu.map((item) => ({
        _id: item._id,
        name: item.name,
        basePrice: item.basePrice,
        images: item.images,
        isVeg: item.isVeg,
        isJain: item.isJain,
        description: item.description,
        preparationTime: item.preparationTime,
        spiceLevel: item.spiceLevel,

        // ✅ FIXED
        category: item.subCategory?.category?.name || null,
        subCategory: item.subCategory?.name || null,

        quantity: null,
      }));
    }

    const menuIds = menu.map((m) => new mongoose.Types.ObjectId(m._id));

    // ✅ FIXED (optimized aggregation)
    const ratings = await Review.aggregate([
      {
        $match: {
          menuItem: { $in: menuIds },
          rating: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$menuItem",
          avgRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    const ratingMap = {};
    ratings.forEach((r) => {
      ratingMap[r._id.toString()] = {
        avgRating: Number(r.avgRating.toFixed(1)),
        totalReviews: r.totalReviews,
      };
    });

    const finalMenu = menu.map((item) => {
      const ratingData = ratingMap[item._id.toString()] || {
        avgRating: 0,
        totalReviews: 0,
      };

      return {
        ...item,
        rating: ratingData.avgRating,
        reviewCount: ratingData.totalReviews,
      };
    });

    res.status(200).json({
      success: true,
      data: finalMenu,
    });
  } catch (err) {
    next(err);
  }
};

exports.getDailyRosterMenu = async (req, res, next) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const roster = await DailyRoster.find({
      date: { $gte: start, $lte: end },
    })
      .populate({
        path: "items.id",
        select:
          "name basePrice images isVeg isJain description preparationTime spiceLevel subCategory",
        populate: {
          path: "subCategory",
          select: "name category",
          populate: {
            path: "category",
            select: "name",
          },
        },
      })
      .lean();

    if (!roster.length) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const menu = roster.flatMap((r) =>
      r.items
        .filter((item) => item.quantity > 0 && item.id)
        .map((item) => ({
          _id: item.id._id,
          name: item.id.name,
          basePrice: item.id.basePrice,
          images: item.id.images,
          isVeg: item.id.isVeg,
          isJain: item.id.isJain,
          description: item.id.description,
          preparationTime: item.id.preparationTime,
          spiceLevel: item.id.spiceLevel,

          // ✅ FIXED
          category: item.id.subCategory?.category?.name || null,
          subCategory: item.id.subCategory?.name || null,

          quantity: item.quantity,
        })),
    );

    res.status(200).json({
      success: true,
      data: menu,
    });
  } catch (err) {
    next(err);
  }
};