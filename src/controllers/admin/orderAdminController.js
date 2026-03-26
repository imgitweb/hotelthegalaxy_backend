const Order = require("../../models/User/ordersModel");

exports.getAllOrders = async (req, res, next) => {
  try {

    // const orders = await Order.find()
    //   .populate("user", "name email phone")
    //   .populate("items.menuItem", "name basePrice images")
    const orders = await Order.find()
  .populate("user", "name email phone")
  .populate("items.menuItem", "name basePrice images")
  .populate("rider", "name phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });

  } catch (error) {
    next(error);
  }
};


exports.updateOrderStatus = async (req, res, next) => {
  try {

    const { status } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    order.status = status;

    await order.save();

    res.status(200).json({
      success: true,
      data: order
    });

  } catch (error) {
    next(error);
  }
};


exports.cancelOrder = async (req, res, next) => {
  try {

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    order.status = "cancelled";

    await order.save();

    res.status(200).json({
      success: true,
      data: order
    });

  } catch (error) {
    next(error);
  }
};

exports.assignRider = async (req, res, next) => {
  try {

    const { riderId } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    order.rider = riderId;
    order.status = "out_for_delivery";

    await order.save();

    res.status(200).json({
      success: true,
      data: order
    });

  } catch (error) {
    next(error);
  }
};

exports.getOrderHistory = async (req,res,next)=>{
try{

const orders = await Order.find({
status:{ $in:["delivered","cancelled"] }
})
.populate("user","name phone")
.populate("rider","name phone")
.sort({createdAt:-1});

res.json({
success:true,
data:orders
});

}catch(err){
next(err)
}
};