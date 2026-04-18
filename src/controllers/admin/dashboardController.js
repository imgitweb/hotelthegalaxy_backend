// const Order = require("../../models/User/ordersModel");
// const MenuItem = require("../../models/dining/menuItemmodel");

// const VALID_ORDER_FILTER = {
//   status: { $ne: "cancelled" },
// };





// exports.getDashboardStats = async (req, res, next) => {
//   try {
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     const week = new Date();
//     week.setDate(week.getDate() - 7);

//     const month = new Date();
//     month.setDate(1);
//     month.setHours(0, 0, 0, 0);

//     const totalOrders = await Order.countDocuments(VALID_ORDER_FILTER);

//     const pendingOrders = await Order.countDocuments({
//       status: "pending",
//     });

//     const todayOrders = await Order.countDocuments({
//       ...VALID_ORDER_FILTER,
//       createdAt: { $gte: today },
//     });

//     const weeklyOrders = await Order.countDocuments({
//       ...VALID_ORDER_FILTER,
//       createdAt: { $gte: week },
//     });

//     const monthlyOrders = await Order.countDocuments({
//       ...VALID_ORDER_FILTER,
//       createdAt: { $gte: month },
//     });

//     const revenue = await Order.aggregate([
//       {
//         $match: {
//           status: { $ne: "cancelled" },
//           "payment.status": "paid",
//         },
//       },
//       { $unwind: "$items" },
//       {
//         $group: {
//           _id: null,
//           totalRevenue: { $sum: "$items.total" },
//         },
//       },
//     ]);

//     res.json({
//       success: true,
//       data: {
//         totalOrders,
//         pendingOrders, // ✅ NEW FIELD
//         todayOrders,
//         weeklyOrders,
//         monthlyOrders,
//         totalRevenue: revenue[0]?.totalRevenue || 0,
//       },
//     });
//   } catch (err) {
//     next(err);
//   }
// };

// exports.getCategorySales = async (req, res, next) => {
//   try {
//     const monthStart = new Date();
//     monthStart.setDate(1);
//     monthStart.setHours(0, 0, 0, 0);

//     const data = await Order.aggregate([
//       {
//         $match: {
//           ...VALID_ORDER_FILTER,
//           createdAt: { $gte: monthStart },
//         },
//       },

//       { $unwind: "$items" },

//       {
//         $lookup: {
//           from: "menuitems",
//           localField: "items.menuItem",
//           foreignField: "_id",
//           as: "menu",
//         },
//       },

//       { $unwind: "$menu" },

//       {
//         $lookup: {
//           from: "categories",
//           localField: "menu.category",
//           foreignField: "_id",
//           as: "category",
//         },
//       },

//       { $unwind: "$category" },

//       {
//         $group: {
//           _id: "$category.name",
//           totalSales: { $sum: "$items.total" },
//           quantity: { $sum: "$items.quantity" },
//         },
//       },

//       {
//         $project: {
//           category: "$_id",
//           totalSales: 1,
//           quantity: 1,
//           _id: 0,
//         },
//       },

//       { $sort: { totalSales: -1 } },
//     ]);

//     res.json({
//       success: true,
//       data,
//     });
//   } catch (err) {
//     next(err);
//   }
// };

// /* ===============================
//    TOP SELLING DISHES
// ================================ */

// exports.getTopDishes = async (req, res, next) => {
//   try {
//     const monthStart = new Date();
//     monthStart.setDate(1);
//     monthStart.setHours(0, 0, 0, 0);

//     const data = await Order.aggregate([
//       {
//         $match: {
//           ...VALID_ORDER_FILTER,
//           createdAt: { $gte: monthStart },
//         },
//       },

//       { $unwind: "$items" },

//       {
//         $group: {
//           _id: "$items.name",
//           totalSales: { $sum: "$items.total" },
//           quantity: { $sum: "$items.quantity" },
//         },
//       },

//       {
//         $project: {
//           dish: "$_id",
//           totalSales: 1,
//           quantity: 1,
//           _id: 0,
//         },
//       },

//       { $sort: { quantity: -1 } },

//       { $limit: 10 },
//     ]);

//     res.json({
//       success: true,
//       data,
//     });
//   } catch (err) {
//     next(err);
//   }
// };

// /* ===============================
//    ORDERS BY LANDMARK
// ================================ */

// exports.getOrdersByLandmark = async (req, res, next) => {
//   try {
//     const data = await Order.aggregate([
//       {
//         $match: {
//           ...VALID_ORDER_FILTER,
//           "address.street": { $ne: null },
//         },
//       },

//       {
//         $group: {
//           _id: "$address.street",
//           orders: { $sum: 1 },
//           revenue: { $sum: "$pricing.total" },
//         },
//       },

//       {
//         $project: {
//           landmark: "$_id",
//           orders: 1,
//           revenue: 1,
//           _id: 0,
//         },
//       },

//       { $sort: { orders: -1 } },
//     ]);

//     res.json({
//       success: true,
//       data,
//     });
//   } catch (err) {
//     next(err);
//   }
// };

// exports.getMostSellingItem = async (req,res,next)=>{
// try{

// const data = await Order.aggregate([

// { $match: VALID_ORDER_FILTER },

// { $unwind:"$items" },

// {
// $group:{
// _id:"$items.name",
// totalQty:{ $sum:"$items.quantity" }
// }
// },

// { $sort:{ totalQty:-1 } },

// { $limit:1 }

// ]);

// res.json({
// success:true,
// data:data[0] || null
// });

// }catch(err){
// next(err);
// }
// };


const Order = require("../../models/User/ordersModel");
const MenuItem = require("../../models/dining/menuItemmodel");

const VALID_ORDER_FILTER = {
  status: { $ne: "cancelled" },
};

// ─── Reusable date range helper ───────────────────────────────────────────────
const getDateRange = (period) => {
  const now = new Date();

  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (period === "last7") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (period === "lastMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end };
  }

  if (period === "thisMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: now };
  }

  // default: all time
  return null;
};

// ─── Revenue aggregation helper ───────────────────────────────────────────────
const getRevenue = async (matchExtra = {}) => {
  const result = await Order.aggregate([
    {
      $match: {
        status: { $ne: "cancelled" },
        "payment.status": "paid",
        ...matchExtra,
      },
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: null,
        total: { $sum: "$items.total" },
      },
    },
  ]);
  return result[0]?.total || 0;
};

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      totalOrders,
      pendingOrders,
      todayOrders,
      weeklyOrders,
      monthlyOrders,
      deliveredToday,
      deliveredWeekly,
      deliveredMonthly,
      totalRevenue,
      todayRevenue,
      weeklyRevenue,
      monthlyRevenue,
    ] = await Promise.all([
      Order.countDocuments(VALID_ORDER_FILTER),
    Order.countDocuments({
  status: { $nin: ["delivered", "cancelled"] }, // not delivered, not cancelled
  paymentStatus: "paid", // only paid orders
}),

      Order.countDocuments({
        ...VALID_ORDER_FILTER,
        createdAt: { $gte: today },
      }),
      Order.countDocuments({
        ...VALID_ORDER_FILTER,
        createdAt: { $gte: weekStart },
      }),
      Order.countDocuments({
        ...VALID_ORDER_FILTER,
        createdAt: { $gte: monthStart },
      }),

      // delivered counts
      Order.countDocuments({
        status: "delivered",
        createdAt: { $gte: today },
      }),
      Order.countDocuments({
        status: "delivered",
        createdAt: { $gte: weekStart },
      }),
      Order.countDocuments({
        status: "delivered",
        createdAt: { $gte: monthStart },
      }),

      // revenues
      getRevenue(),
      getRevenue({ createdAt: { $gte: today } }),
      getRevenue({ createdAt: { $gte: weekStart } }),
      getRevenue({ createdAt: { $gte: monthStart } }),
    ]);

    res.json({
      success: true,
      data: {
        totalOrders,
        pendingOrders,
        todayOrders,
        weeklyOrders,
        monthlyOrders,
        deliveredToday,
        deliveredWeekly,
        deliveredMonthly,
        totalRevenue,
        todayRevenue,
        weeklyRevenue,
        monthlyRevenue,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── FILTERED REPORT (last7 / lastMonth / thisMonth / custom) ─────────────────
exports.getFilteredReport = async (req, res, next) => {
  try {
    const { period, from, to } = req.query;

    let dateFilter = {};
    if (from && to) {
      dateFilter = { createdAt: { $gte: new Date(from), $lte: new Date(to) } };
    } else if (period) {
      const range = getDateRange(period);
      if (range) dateFilter = { createdAt: { $gte: range.start, $lte: range.end } };
    }

    const [totalPlaced, delivered, revenue] = await Promise.all([
      Order.countDocuments({ ...VALID_ORDER_FILTER, ...dateFilter }),
      Order.countDocuments({ status: "delivered", ...dateFilter }),
      getRevenue(dateFilter),
    ]);

    res.json({
      success: true,
      data: {
        period: period || "custom",
        totalPlaced,
        delivered,
        pending: totalPlaced - delivered,
        revenue,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── TOP DISHES (with period filter) ─────────────────────────────────────────
exports.getTopDishes = async (req, res, next) => {
  try {
    const { period } = req.query; // today | last7 | lastMonth | thisMonth
    let dateFilter = {};

    if (period) {
      const range = getDateRange(period);
      if (range) dateFilter = { createdAt: { $gte: range.start, $lte: range.end } };
    } else {
      // default: this month
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      dateFilter = { createdAt: { $gte: monthStart } };
    }

    const data = await Order.aggregate([
      { $match: { ...VALID_ORDER_FILTER, ...dateFilter } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          totalSales: { $sum: "$items.total" },
          quantity: { $sum: "$items.quantity" },
        },
      },
      {
        $project: {
          dish: "$_id",
          totalSales: 1,
          quantity: 1,
          _id: 0,
        },
      },
      { $sort: { quantity: -1 } },
      { $limit: 10 },
    ]);

    res.json({ success: true, data, period: period || "thisMonth" });
  } catch (err) {
    next(err);
  }
};

// ─── CATEGORY SALES (with period filter) ─────────────────────────────────────
exports.getCategorySales = async (req, res, next) => {
  try {
    const { period } = req.query;
    let dateFilter = {};

    if (period) {
      const range = getDateRange(period);
      if (range) dateFilter = { createdAt: { $gte: range.start, $lte: range.end } };
    } else {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      dateFilter = { createdAt: { $gte: monthStart } };
    }

    const data = await Order.aggregate([
      { $match: { ...VALID_ORDER_FILTER, ...dateFilter } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "menuitems",
          localField: "items.menuItem",
          foreignField: "_id",
          as: "menu",
        },
      },
      { $unwind: "$menu" },
      {
        $lookup: {
          from: "categories",
          localField: "menu.category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      {
        $group: {
          _id: "$category.name",
          totalSales: { $sum: "$items.total" },
          quantity: { $sum: "$items.quantity" },
        },
      },
      {
        $project: {
          category: "$_id",
          totalSales: 1,
          quantity: 1,
          _id: 0,
        },
      },
      { $sort: { totalSales: -1 } },
    ]);

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── ORDERS BY LANDMARK ───────────────────────────────────────────────────────
exports.getOrdersByLandmark = async (req, res, next) => {
  try {
    const data = await Order.aggregate([
      {
        $match: {
          ...VALID_ORDER_FILTER,
          "address.street": { $ne: null },
        },
      },
      {
        $group: {
          _id: "$address.street",
          orders: { $sum: 1 },
          revenue: { $sum: "$pricing.total" },
        },
      },
      {
        $project: {
          landmark: "$_id",
          orders: 1,
          revenue: 1,
          _id: 0,
        },
      },
      { $sort: { orders: -1 } },
    ]);

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── MOST SELLING ITEM (all time) ─────────────────────────────────────────────
exports.getMostSellingItem = async (req, res, next) => {
  try {
    const data = await Order.aggregate([
      { $match: VALID_ORDER_FILTER },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          totalQty: { $sum: "$items.quantity" },
        },
      },
      { $sort: { totalQty: -1 } },
      { $limit: 1 },
    ]);

    res.json({ success: true, data: data[0] || null });
  } catch (err) {
    next(err);
  }
};