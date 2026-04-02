const Order = require("../../models/User/ordersModel");
const STATUS_FLOW = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["out_for_delivery"],
  preparing:["delivered"], // fix this issue 
  out_for_delivery: ["delivered"],
};
const FINAL_STATES = ["delivered", "cancelled"];
exports.getAllOrders = async (req, res, next) => {
  try {
    console.log("📥 Fetching all orders");

    const orders = await Order.find()
      .populate("user", "name email phone")
      .populate("items.menuItem", "name basePrice images")
      .populate("rider", "name phone")
      .sort({ createdAt: -1 });

    console.log("✅ Orders fetched:", orders.length);

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    console.error("❌ Error in getAllOrders:", error);
    next(error);
  }
};
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status: newStatus } = req.body;

    console.log("📥 Update Order Status Request:", {
      orderId: req.params.id,
      newStatus,
    });

    const order = await Order.findById(req.params.id);

    if (!order) {
      console.log("❌ Order not found");
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    console.log("🔎 Current Order Status:", order.status);
    if (FINAL_STATES.includes(order.status)) {
      console.log("🚫 Cannot modify final state:", order.status);
      return res.status(400).json({
        success: false,
        message: "Order cannot be modified",
      });
    }
    if (order.status === newStatus) {
      console.log("⚠️ Same status update attempted");
      return res.status(400).json({
        success: false,
        message: "Order already in this status",
      });
    }
    if (!STATUS_FLOW[order.status]?.includes(newStatus)) {
      console.log("🚫 Invalid transition:", order.status, "→", newStatus);
      return res.status(400).json({
        success: false,
        message: `Invalid transition from ${order.status} to ${newStatus}`,
      });
    }
    if (newStatus === "out_for_delivery" && !order.rider) {
      console.log("🚫 Rider not assigned");
      return res.status(400).json({
        success: false,
        message: "Assign rider before delivery",
      });
    }
    if (order.payment?.status !== "paid" && newStatus !== "cancelled") {
      console.log("🚫 Payment not completed:", order.payment?.status);
      return res.status(400).json({
        success: false,
        message: "Payment not completed",
      });
    }

    order.status = newStatus;
    console.log("✅ Status updated to:", newStatus);
    if (newStatus === "delivered") {
      order.deliveredAt = new Date();
      console.log("📦 Delivered at set");
    }

    if (newStatus === "out_for_delivery") {
      order.outForDeliveryAt = new Date();
      console.log("🚴 Out for delivery at set");
    }

    await order.save();

    console.log("💾 Order saved successfully");

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("❌ Error in updateOrderStatus:", error);
    next(error);
  }
};

exports.cancelOrder = async (req, res, next) => {
  try {
    console.log("📥 Cancel Order Request:", req.params.id);

    const order = await Order.findById(req.params.id);

    if (!order) {
      console.log("❌ Order not found");
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }
    if (FINAL_STATES.includes(order.status)) {
      console.log("🚫 Cannot cancel final state:", order.status);
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled",
      });
    }

    order.status = "cancelled";

    console.log("✅ Order cancelled");

    await order.save();

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("❌ Error in cancelOrder:", error);
    next(error);
  }
};

exports.assignRider = async (req, res, next) => {
  try {
    const { riderId } = req.body;

    console.log("📥 Assign Rider Request:", {
      orderId: req.params.id,
      riderId,
    });

    if (!riderId) {
      console.log("❌ Rider ID missing");
      return res.status(400).json({
        success: false,
        message: "Rider ID required",
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      console.log("❌ Order not found");
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }
    if (FINAL_STATES.includes(order.status)) {
      console.log("🚫 Cannot assign rider to final state");
      return res.status(400).json({
        success: false,
        message: "Cannot assign rider",
      });
    }

    if (order.rider) {
      console.log("⚠️ Rider already assigned");
      return res.status(400).json({
        success: false,
        message: "Rider already assigned",
      });
    }

    order.rider = riderId;

    console.log("✅ Rider assigned");
    if (order.status === "ready") {
      order.status = "out_for_delivery";
      order.outForDeliveryAt = new Date();
      console.log("🚴 Auto moved to out_for_delivery");
    }

    await order.save();

    console.log("💾 Order saved after rider assignment");

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("❌ Error in assignRider:", error);
    next(error);
  }
};

exports.getOrderHistory = async (req, res, next) => {
  try {
    console.log("📥 Fetching order history");

    const orders = await Order.find({
      status: { $in: ["delivered", "cancelled"] },
    })
      .populate("user", "name phone")
      .populate("rider", "name phone")
      .sort({ createdAt: -1 });

    console.log("✅ History fetched:", orders.length);

    res.json({
      success: true,
      data: orders,
    });
  } catch (err) {
    console.error("❌ Error in getOrderHistory:", err);
    next(err);
  }
};
