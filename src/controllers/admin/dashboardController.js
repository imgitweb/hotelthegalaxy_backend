const Order = require("../../models/User/ordersModel");
const MenuItem = require("../../models/dining/menuItemmodel");

const VALID_ORDER_FILTER = {
  status: { $ne: "cancelled" },
};


exports.getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const week = new Date();
    week.setDate(week.getDate() - 7);

    const month = new Date();
    month.setDate(1);
    month.setHours(0, 0, 0, 0);

    const totalOrders = await Order.countDocuments(VALID_ORDER_FILTER);

    const todayOrders = await Order.countDocuments({
      ...VALID_ORDER_FILTER,
      createdAt: { $gte: today },
    });

    const weeklyOrders = await Order.countDocuments({
      ...VALID_ORDER_FILTER,
      createdAt: { $gte: week },
    });

    const monthlyOrders = await Order.countDocuments({
      ...VALID_ORDER_FILTER,
      createdAt: { $gte: month },
    });

    const revenue = await Order.aggregate([
      { $match: VALID_ORDER_FILTER },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$pricing.total" },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        totalOrders,
        todayOrders,
        weeklyOrders,
        monthlyOrders,
        totalRevenue: revenue[0]?.totalRevenue || 0,
      },
    });
  } catch (err) {
    next(err);
  }
};



exports.getCategorySales = async (req, res, next) => {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const data = await Order.aggregate([
      {
        $match: {
          ...VALID_ORDER_FILTER,
          createdAt: { $gte: monthStart },
        },
      },

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

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

/* ===============================
   TOP SELLING DISHES
================================ */

exports.getTopDishes = async (req, res, next) => {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const data = await Order.aggregate([
      {
        $match: {
          ...VALID_ORDER_FILTER,
          createdAt: { $gte: monthStart },
        },
      },

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

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

/* ===============================
   ORDERS BY LANDMARK
================================ */

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

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

exports.getMostSellingItem = async (req,res,next)=>{
try{

const data = await Order.aggregate([

{ $match: VALID_ORDER_FILTER },

{ $unwind:"$items" },

{
$group:{
_id:"$items.name",
totalQty:{ $sum:"$items.quantity" }
}
},

{ $sort:{ totalQty:-1 } },

{ $limit:1 }

]);

res.json({
success:true,
data:data[0] || null
});

}catch(err){
next(err);
}
};
