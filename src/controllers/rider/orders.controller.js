const Order = require("../../models/order.model");

exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({
      rider: req.user._id,
      status: { $in: ["out_for_delivery", "confirmed"] },
    }).populate("user", "name phone");

    res.json({
      success: true,
      data: orders,
    });
  } catch (err) {
    next(err);
  }
};
