const Order = require("../../models/User/ordersModel");
const { getIO } = require("../../config/socket");
const Trip = require("../../models/TripModel");
const Rider = require("../../models/rider.model");
const { generateOTPMap } = require("../../utils/otp");
const STATUS_FLOW = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "out_for_delivery", "cancelled"],
  preparing: ["ready", "out_for_delivery", "delivered"],
  ready: ["out_for_delivery", "delivered"],
  out_for_delivery: ["arrived", "delivered"],
  arrived: ["delivered"],
  delivered: [],
  cancelled: [],
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

      // Auto-create or add to trip
      if (order.rider) {
        const existingTrip = await Trip.findOne({
          riderId: order.rider,
          status: "Active",
        });

        if (existingTrip) {
          // Add order to existing trip if not already present
          if (!existingTrip.orderIds.includes(order._id)) {
            existingTrip.orderIds.push(order._id);
            await existingTrip.save();
            console.log("✅ Order added to existing trip:", existingTrip.tripId);
          }
          order.tripId = existingTrip._id;
        } else {
          // Create new trip for this order
          const tripId = `TRIP_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          const otpMap = generateOTPMap([order._id.toString()]);

          const trip = await Trip.create({
            tripId,
            riderId: order.rider,
            orderIds: [order._id],
            status: "Active",
            orderOtps: otpMap,
            totalEarnings: order.pricing?.total || 0,
          });

          // Set delivery OTP
          order.deliveryOTP = {
            code: otpMap[order._id.toString()],
            generatedAt: new Date(),
            verifiedAt: null,
            attempts: 0,
            maxAttempts: 3,
          };

          // Update rider status
          await Rider.findByIdAndUpdate(order.rider, {
            status: "On-Trip",
            currentTripId: trip._id,
          });

          order.tripId = trip._id;
          console.log("✅ New trip created:", trip.tripId);
        }
      }
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
    console.log("..............", req.body);

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

    // Populate user and rider info so we can send complete data via socket if needed
    const order = await Order.findById(req.params.id).populate("user", "name email phone");

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
    if (!["delivered", "cancelled"].includes(order.status)) {
      if (order.status !== "out_for_delivery") {
        order.status = "out_for_delivery";
        order.outForDeliveryAt = new Date();
        console.log("🚴 Order status moved to out_for_delivery");
      }

      const existingTrip = await Trip.findOne({
        riderId: order.rider,
        status: "Active",
      });

      if (existingTrip) {
        if (!existingTrip.orderIds.includes(order._id)) {
          existingTrip.orderIds.push(order._id);
          await existingTrip.save();
          console.log("✅ Order added to existing trip:", existingTrip.tripId);
        }
        order.tripId = existingTrip._id;
      } else {
        const tripId = `TRIP_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)
          .toUpperCase()}`;
        const otpMap = generateOTPMap([order._id.toString()]);

        const trip = await Trip.create({
          tripId,
          riderId: order.rider,
          orderIds: [order._id],
          status: "Active",
          orderOtps: otpMap,
          totalEarnings: order.pricing?.total || 0,
        });

        order.deliveryOTP = {
          code: otpMap[order._id.toString()],
          generatedAt: new Date(),
          verifiedAt: null,
          attempts: 0,
          maxAttempts: 3,
        };

        await Rider.findByIdAndUpdate(order.rider, {
          status: "On-Trip",
          currentTripId: trip._id,
        });

        order.tripId = trip._id;
        console.log("✅ New trip created:", trip.tripId);
      }
    }

    await order.save();
    console.log("💾 Order saved after rider assignment");

    // ============================
    // ⚡ WEBSOCKET EMIT (ASSIGN RIDER)
    // ============================
    try {
      const io = getIO();
      
      // 1. Emit to Admin Dashboard
      io.to("admin_room").emit("admin_order_updated", {
        orderId: order._id,
        status: order.status,
        riderId: order.rider,
        message: "Rider assigned successfully",
      });

      // 2. Emit to the specific Rider App
      io.to(`rider_${order.rider}`).emit("new_trip_assigned", {
        orderId: order._id,
        tripId: order.tripId,
        message: "You have been assigned a new order",
      });

      // 3. Emit to User Order Tracking Room
      io.to(order._id.toString()).emit("order_update", {
        orderId: order._id,
        status: order.status,
        message: "A rider has been assigned and your order is out for delivery",
      });

      console.log("⚡ Socket events emitted successfully for rider assignment");
    } catch (socketErr) {
      console.error("⚠️ Socket emit error (Assign Rider):", socketErr.message);
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("❌ Error in assignRider:", error);
    next(error);
  }
};


// exports.assignRider = async (req, res, next) => {
//   try {
//     const { riderId } = req.body;
//     console.log("..............",req.body)

//     console.log("📥 Assign Rider Request:", {
//       orderId: req.params.id,
//       riderId,
//     });

//     if (!riderId) {
//       console.log("❌ Rider ID missing");
//       return res.status(400).json({
//         success: false,
//         message: "Rider ID required",
//       });
//     }

//     const order = await Order.findById(req.params.id);

//     if (!order) {
//       console.log("❌ Order not found");
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }
//     if (FINAL_STATES.includes(order.status)) {
//       console.log("🚫 Cannot assign rider to final state");
//       return res.status(400).json({
//         success: false,
//         message: "Cannot assign rider",
//       });
//     }

//     if (order.rider) {
//       console.log("⚠️ Rider already assigned");
//       return res.status(400).json({
//         success: false,
//         message: "Rider already assigned",
//       });
//     }

//     order.rider = riderId;

//     console.log("✅ Rider assigned");
//     if (!["delivered", "cancelled"].includes(order.status)) {
//       if (order.status !== "out_for_delivery") {
//         order.status = "out_for_delivery";
//         order.outForDeliveryAt = new Date();
//         console.log("🚴 Order status moved to out_for_delivery");
//       }

//       const existingTrip = await Trip.findOne({
//         riderId: order.rider,
//         status: "Active",
//       });

//       if (existingTrip) {
//         if (!existingTrip.orderIds.includes(order._id)) {
//           existingTrip.orderIds.push(order._id);
//           await existingTrip.save();
//           console.log("✅ Order added to existing trip:", existingTrip.tripId);
//         }
//         order.tripId = existingTrip._id;
//       } else {
//         const tripId = `TRIP_${Date.now()}_${Math.random()
//           .toString(36)
//           .substr(2, 9)
//           .toUpperCase()}`;
//         const otpMap = generateOTPMap([order._id.toString()]);

//         const trip = await Trip.create({
//           tripId,
//           riderId: order.rider,
//           orderIds: [order._id],
//           status: "Active",
//           orderOtps: otpMap,
//           totalEarnings: order.pricing?.total || 0,
//         });

//         order.deliveryOTP = {
//           code: otpMap[order._id.toString()],
//           generatedAt: new Date(),
//           verifiedAt: null,
//           attempts: 0,
//           maxAttempts: 3,
//         };

//         await Rider.findByIdAndUpdate(order.rider, {
//           status: "On-Trip",
//           currentTripId: trip._id,
//         });

//         order.tripId = trip._id;
//         console.log("✅ New trip created:", trip.tripId);
//       }
//     }

//     await order.save();

//     console.log("💾 Order saved after rider assignment");

//     res.status(200).json({
//       success: true,
//       data: order,
//     });
//   } catch (error) {
//     console.error("❌ Error in assignRider:", error);
//     next(error);
//   }
// };

exports.getOrderHistory = async (req, res, next) => {
  try {
    console.log("📥 Fetching order history");

    const orders = await Order.find({
      status: { $in: ["delivered", "cancelled"] },
    })
      .populate("user", "fullName phone")
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

// exports.assignRiderToOrder = async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const { riderId } = req.body;

//     // 1. Update Order in Database
//     const order = await Order.findByIdAndUpdate(
//       orderId,
//       { rider: riderId, status: "out_for_delivery" },
//       { new: true }
//     ).populate("rider user"); // Populate necessary details

//     if (!order) {
//       return res.status(404).json({ success: false, message: "Order not found" });
//     }

//     // 2. Update Rider Status (Optional: Mark them on-trip)
//     await Rider.findByIdAndUpdate(riderId, { status: "On-Trip" });

//     // ==========================================
//     // 3. WEBSOCKET REAL-TIME NOTIFICATION LOGIC
//     // ==========================================
//     const wss = getWebSocketServer(); 
    
//     if (wss) {
//       wss.clients.forEach((client) => {
//         // Notify the specific Rider
//         if (client.role === "rider" && client.userId === riderId.toString()) {
//           client.send(JSON.stringify({
//             type: "order_assigned",
//             message: "You have a new delivery assignment!",
//             order: order
//           }));
//         }

//         // Notify all connected Admins (so their dashboard updates instantly)
//         if (client.role === "admin") {
//           client.send(JSON.stringify({
//             type: "admin_order_updated",
//             order: order
//           }));
//         }
//       });
//     }

//     // 4. Send HTTP Response back to the Admin who clicked the button
//     return res.status(200).json({
//       success: true,
//       message: "Rider assigned successfully",
//       data: order
//     });

//   } catch (error) {
//     console.error("Assign Rider Error:", error);
//     return res.status(500).json({ success: false, message: "Server error" });
//   }
// };
