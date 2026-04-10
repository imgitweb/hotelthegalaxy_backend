const Order = require("../../models/User/ordersModel");

exports.assignOrdersToRider = async (req, res, next) => {
  try {
    const { riderId, orderIds } = req.body;

    await Order.updateMany(
      { _id: { $in: orderIds } },
      {
        rider: riderId,
        status: "out_for_delivery",
      },
    );

    res.json({
      success: true,
      message: "Orders assigned to rider",
    });
  } catch (err) {
    next(err);
  }
};
