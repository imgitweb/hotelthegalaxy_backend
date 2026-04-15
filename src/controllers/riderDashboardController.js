const Trip = require("../models/TripModel");
const Order = require("../models/User/ordersModel");
const Rider = require("../models/rider.model");
const { sendOTP } = require("../services/smsService");
const getDistanceKm = require("../utils/distanceService");

const HOTEL_LOCATION = {
  lat: 22.061401,
  lng: 78.94776,
};

const calculateOrderDistance = async (order) => {
  if (typeof order.distanceKm === "number" && order.distanceKm > 0) return order.distanceKm;

  const addressCoords = order.address?.lat != null && order.address?.lng != null
    ? { lat: order.address.lat, lng: order.address.lng }
    : order.address?.location?.coordinates?.length === 2
    ? { lat: order.address.location.coordinates[1], lng: order.address.location.coordinates[0] }
    : null;

  if (addressCoords) {
    try {
      const distance = await getDistanceKm(HOTEL_LOCATION, addressCoords);
      if (distance > 0) await Order.findByIdAndUpdate(order._id, { distanceKm: distance });
      return distance;
    } catch (error) {
      return 0;
    }
  }
  return typeof order.distanceKm === "number" ? order.distanceKm : order.distance || 0;
};

const isSameCalendarDay = (dateValue, compareDate = new Date()) => {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  return (
    date.getFullYear() === compareDate.getFullYear() &&
    date.getMonth() === compareDate.getMonth() &&
    date.getDate() === compareDate.getDate()
  );
};

const isTodayOrder = (order) =>
  isSameCalendarDay(order.createdAt) ||
  isSameCalendarDay(order.updatedAt) ||
  isSameCalendarDay(order.timeline?.pickedAt) ||
  isSameCalendarDay(order.timeline?.confirmedAt) ||
  isSameCalendarDay(order.timeline?.preparingAt) ||
  isSameCalendarDay(order.timeline?.readyAt) ||
  isSameCalendarDay(order.timeline?.arrivedAt);

// ================= HELPER TO FORMAT ORDERS PROPERLY =================
const formatOrderForRider = async (order, distanceCalc = true) => {
  const distance = distanceCalc ? await calculateOrderDistance(order) : order.distanceKm || 0;

  // Safely extract Address & Landmark
  let addressStr = order.address?.fullAddress || order.address?.street || order.address?.address || "Address not available";
  if (order.address?.landmark) {
    addressStr += ` (Landmark: ${order.address.landmark})`;
  }

  // Safely extract Items
  let formattedItems = [];
  if (order.items && Array.isArray(order.items)) {
    formattedItems = order.items.map(item => ({
      name: item.name || item.menuItem?.name || "Item",
      quantity: item.quantity || 1
    }));
  }

  return {
    _id: order._id,
    id: order._id,
    orderNumber: order.orderId || order.orderNumber || order._id.toString().slice(-6).toUpperCase(),
    customerName: order.user?.fullName || order.user?.name || order.customerName || "Unknown",
    customerPhone: order.user?.phone || order.phone || order.mobile || "",
    deliveryAddress: addressStr,
    amount: order.pricing?.total || order.totalAmount || order.total || 0,
    payment: {
      method: order.payment?.method || "COD",
      status: order.payment?.status || "Pending" // VERY IMPORTANT FOR FRONTEND
    },
    status: order.status === "out_for_delivery" ? "Out for Delivery" : order.status === "arrived" ? "Arrived" : order.status,
    distance: distance,
    items: formattedItems,
    deliveryOTP: order.deliveryOTP?.code || null,
    lat: order.address?.lat ?? order.address?.location?.coordinates?.[1] ?? null,
    lng: order.address?.lng ?? order.address?.location?.coordinates?.[0] ?? null,
  };
};

exports.getActiveTrip = async (req, res, next) => {
  try {
    res.set({ "Cache-Control": "no-cache", Pragma: "no-cache", Expires: "0" });
    const riderId = req.riderId;

    const trip = await Trip.findOne({
      riderId,
      status: { $in: ["Active", "Pending"] },
    }).populate({ path: "orderIds", populate: { path: "user", select: "fullName phone" } });

    if (!trip) {
      const assignedOrders = await Order.find({
        rider: riderId,
        status: { $nin: ["delivered", "cancelled"] },
      }).populate("user", "fullName phone").populate("items.menuItem"); // Ensure items are populated if referencing ObjectId

      const todayOrders = assignedOrders.filter(isTodayOrder);
      if (todayOrders.length > 0) {
        let orders = await Promise.all(todayOrders.map(o => formatOrderForRider(o)));
        orders = orders.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));

        const pseudoTripId = todayOrders[0].tripId ? todayOrders[0].tripId.toString() : `ASSIGNED_${todayOrders[0]._id.toString().slice(0, 8)}`;

        return res.json({
          success: true,
          data: {
            trip: {
              _id: null,
              tripId: pseudoTripId,
              status: "Active",
              startTime: todayOrders[0].timeline?.pickedAt || todayOrders[0].createdAt,
              totalEarnings: orders.reduce((sum, o) => sum + (o.amount || 0), 0),
            },
            orders,
          },
        });
      }
      return res.json({ success: true, data: null, message: "No active trip found" });
    }

    const todayTripOrders = trip.orderIds.filter(isTodayOrder);
    if (todayTripOrders.length === 0) {
      return res.json({ success: true, data: null, message: "No active trip found" });
    }

    let orders = await Promise.all(todayTripOrders.map(o => formatOrderForRider(o)));
    orders = orders.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));

    res.json({
      success: true,
      data: {
        trip: {
          _id: trip._id,
          tripId: trip.tripId,
          status: trip.status,
          startTime: trip.startTime,
          totalEarnings: trip.totalEarnings,
        },
        orders,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.markOrderArrived = async (req, res, next) => {
  try {
    res.set({ "Cache-Control": "no-cache", Pragma: "no-cache", Expires: "0" });
    const { orderId } = req.params;
    const riderId = req.riderId;

    const order = await Order.findById(orderId).populate("user", "fullName phone");

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.rider?.toString() !== riderId?.toString()) return res.status(403).json({ success: false, message: "You are not assigned to this order" });
    if (["arrived", "delivered", "cancelled"].includes(order.status)) return res.status(400).json({ success: false, message: "Order is already completed or cancelled" });

    order.status = "arrived";
    order.timeline.arrivedAt = new Date();
    await order.save();

    const deliveryOTP = order.deliveryOTP?.code;
    const customerPhone = order.user?.phone || order.phone || order.mobile || "";

    if (deliveryOTP && customerPhone) {
      try { await sendOTP(customerPhone, deliveryOTP); } catch (err) {}
    }

    res.json({
      success: true,
      message: "Rider marked as arrived. Customer notified with OTP.",
      data: { orderId: order._id, status: order.status, arrivedAt: order.timeline.arrivedAt },
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyDeliveryOTP = async (req, res, next) => {
  try {
    res.set({ "Cache-Control": "no-cache", Pragma: "no-cache", Expires: "0" });
    const { orderId } = req.params;
    const { otp } = req.body;
    const riderId = req.riderId;
    console.log("..............rider id ",otp)

    const order = await Order.findById(orderId).populate("user", "fullName phone");

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.rider?.toString() !== riderId?.toString()) return res.status(403).json({ success: false, message: "You are not assigned" });
    if (order.status === "delivered") return res.status(400).json({ success: false, message: "Order already delivered" });

    const { hashOTP } = require("../utils/otp");

    // if (order.deliveryOTP.attempts >= order.deliveryOTP.maxAttempts) {
    //   return res.status(400).json({ success: false, message: "Maximum OTP attempts exceeded", attemptsRemaining: 0 });
    // }

    const otpa =  hashOTP(otp)

    console.log("has otp .......", otpa)

    const isMatch = hashOTP(otp) === order.deliveryOTP.code;
    console.log("is match......... ",isMatch)

    if (!isMatch) {
      order.deliveryOTP.attempts += 1;
      await order.save();
      const remaining = order.deliveryOTP.maxAttempts - order.deliveryOTP.attempts;
      return res.status(400).json({ success: false, message: `Invalid OTP. ${remaining} attempts remaining`, attemptsRemaining: remaining });
    }

    order.status = "delivered";
    order.deliveryOTP.verifiedAt = new Date();
    order.timeline.deliveredAt = new Date();
    await order.save();

    const trip = await Trip.findById(order.tripId).populate("orderIds");
    if (trip) {
      const allDelivered = trip.orderIds.every((o) => o.status === "delivered");
      if (allDelivered) {
        trip.status = "Completed";
        trip.endTime = new Date();
        await trip.save();

        await Rider.findByIdAndUpdate(riderId, { status: "Available", currentTripId: null });
        return res.json({ success: true, message: "Order delivered successfully", tripCompleted: true });
      }
    }

    res.json({ success: true, message: "Order delivered successfully", tripCompleted: false });
  } catch (error) {
    next(error);
  }
};

exports.getRiderHistory = async (req, res, next) => {
  try {
    res.set({ "Cache-Control": "no-cache", Pragma: "no-cache", Expires: "0" });
    const riderId = req.riderId;
    const { page = 1, limit = 10 } = req.query;

    const trips = await Trip.find({ riderId, status: "Completed" })
      .populate({ path: "orderIds", populate: { path: "user items.menuItem" } })
      .sort({ endTime: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalTrips = await Trip.countDocuments({ riderId, status: "Completed" });

    // Format the historical orders precisely using the helper
    const formattedTrips = await Promise.all(trips.map(async (trip) => {
      const formattedOrders = await Promise.all(trip.orderIds.map(o => formatOrderForRider(o, false)));
      return { ...trip.toObject(), orderIds: formattedOrders };
    }));

    res.json({
      success: true,
      data: formattedTrips,
      pagination: { currentPage: parseInt(page), totalPages: Math.ceil(totalTrips / limit), totalTrips },
    });
  } catch (error) {
    next(error);
  }
};






























// const Trip = require("../models/TripModel");
// const Order = require("../models/User/ordersModel");
// const Rider = require("../models/rider.model");
// const { sendOTP } = require("../services/smsService");
// const getDistanceKm = require("../utils/distanceService");

// const HOTEL_LOCATION = {
//   lat: 22.061401,
//   lng: 78.94776,
// };

// const calculateOrderDistance = async (order) => {
//   if (typeof order.distanceKm === "number" && order.distanceKm > 0) {
//     return order.distanceKm;
//   }

//   const addressCoords = order.address?.lat != null && order.address?.lng != null
//     ? { lat: order.address.lat, lng: order.address.lng }
//     : order.address?.location?.coordinates?.length === 2
//     ? {
//         lat: order.address.location.coordinates[1],
//         lng: order.address.location.coordinates[0],
//       }
//     : null;

//   if (addressCoords) {
//     try {
//       const distance = await getDistanceKm(HOTEL_LOCATION, addressCoords);
//       if (distance > 0) {
//         await Order.findByIdAndUpdate(order._id, { distanceKm: distance });
//       }
//       return distance;
//     } catch (error) {
//       console.error("Error calculating distance for order", order._id, error);
//       return 0;
//     }
//   }

//   return typeof order.distanceKm === "number"
//     ? order.distanceKm
//     : order.distance || 0;
// };

// const isSameCalendarDay = (dateValue, compareDate = new Date()) => {
//   if (!dateValue) return false;
//   const date = new Date(dateValue);
//   return (
//     date.getFullYear() === compareDate.getFullYear() &&
//     date.getMonth() === compareDate.getMonth() &&
//     date.getDate() === compareDate.getDate()
//   );
// };

// const isTodayOrder = (order) =>
//   isSameCalendarDay(order.createdAt) ||
//   isSameCalendarDay(order.updatedAt) ||
//   isSameCalendarDay(order.timeline?.pickedAt) ||
//   isSameCalendarDay(order.timeline?.confirmedAt) ||
//   isSameCalendarDay(order.timeline?.preparingAt) ||
//   isSameCalendarDay(order.timeline?.readyAt) ||
//   isSameCalendarDay(order.timeline?.arrivedAt);

// exports.getActiveTrip = async (req, res, next) => {
//   try {
//     res.set({
//       "Cache-Control": "no-cache, no-store, must-revalidate, private",
//       Pragma: "no-cache",
//       Expires: "0",
//     });

//     const riderId = req.riderId;

//     const trip = await Trip.findOne({
//       riderId,
//       status: { $in: ["Active", "Pending"] },
//     }).populate({
//       path: "orderIds",
//       populate: {
//         path: "user",
//         select: "fullName phone",
//       },
//     });

//     if (!trip) {
//       const assignedOrders = await Order.find({
//         rider: riderId,
//         status: { $nin: ["delivered", "cancelled"] },
//       }).populate("user", "fullName phone");

//       const todayOrders = assignedOrders.filter(isTodayOrder);
//       if (todayOrders.length > 0) {
//         let orders = await Promise.all(todayOrders
//           .map(async (order) => {
//             const distance = await calculateOrderDistance(order);
//             return {
//               _id: order._id,
//               id: order._id,
//               customerName:
//                 order.user?.fullName ||
//                 order.user?.name ||
//                 order.customerName ||
//                 "Unknown",
//               customer:
//                 order.user?.fullName ||
//                 order.user?.name ||
//                 order.customerName ||
//                 "Unknown",
//               user: {
//                 fullName: order.user?.fullName || order.user?.name || null,
//                 phone: order.user?.phone || null,
//               },
//               deliveryAddress:
//                 order.address?.fullAddress ||
//                 order.address?.street ||
//                 order.address?.address ||
//                 "Address not available",
//               address:
//                 order.address?.fullAddress ||
//                 order.address?.street ||
//                 order.address?.address ||
//                 "Address not available",
//               customerPhone:
//                 order.user?.phone ||
//                 order.phone ||
//                 order.mobile ||
//                 "",
//               phone:
//                 order.user?.phone ||
//                 order.phone ||
//                 order.mobile ||
//                 "",
//               totalAmount: order.pricing?.total || order.total || 0,
//               amount: order.pricing?.total || order.total || 0,
//               paymentMethod: order.payment?.method || "COD",
//               distance: distance,
//               status:
//                 order.status === "out_for_delivery"
//                   ? "Out for Delivery"
//                   : order.status === "arrived"
//                   ? "Arrived"
//                   : order.status,
//               deliveryOTP: order.deliveryOTP?.code || null,
//               lat:
//                 order.address?.lat ??
//                 order.address?.location?.coordinates?.[1] ??
//                 null,
//               lng:
//                 order.address?.lng ??
//                 order.address?.location?.coordinates?.[0] ??
//                 null,
//             };
//           }));
//         orders = orders.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));

//         const pseudoTripId = todayOrders[0].tripId
//           ? todayOrders[0].tripId.toString()
//           : `ASSIGNED_${todayOrders[0]._id.toString().slice(0, 8)}`;

//         return res.json({
//           success: true,
//           data: {
//             trip: {
//               _id: null,
//               tripId: pseudoTripId,
//               status: "Active",
//               startTime:
//                 todayOrders[0].timeline?.pickedAt ||
//                 todayOrders[0].createdAt,
//               totalEarnings: orders.reduce(
//                 (sum, o) => sum + (o.totalAmount || 0),
//                 0
//               ),
//             },
//             orders,
//           },
//         });
//       }

//       return res.json({
//         success: true,
//         data: null,
//         message: "No active trip found",
//       });
//     }

//     const todayTripOrders = trip.orderIds.filter(isTodayOrder);
//     if (todayTripOrders.length === 0) {
//       return res.json({
//         success: true,
//         data: null,
//         message: "No active trip found",
//       });
//     }

//     let orders = await Promise.all(todayTripOrders
//       .map(async (order) => {
//         const distance = await calculateOrderDistance(order);
//         return {
//           _id: order._id,
//           id: order._id,
//           customerName:
//             order.user?.fullName ||
//             order.user?.name ||
//             order.customerName ||
//             "Unknown",
//           customer:
//             order.user?.fullName ||
//             order.user?.name ||
//             order.customerName ||
//             "Unknown",
//           user: {
//             fullName: order.user?.fullName || order.user?.name || null,
//             phone: order.user?.phone || null,
//           },
//           deliveryAddress:
//             order.address?.fullAddress ||
//             order.address?.street ||
//             order.address?.address ||
//             "Address not available",
//           address:
//             order.address?.fullAddress ||
//             order.address?.street ||
//             order.address?.address ||
//             "Address not available",
//           customerPhone:
//             order.user?.phone ||
//             order.phone ||
//             order.mobile ||
//             "",
//           phone:
//             order.user?.phone ||
//             order.phone ||
//             order.mobile ||
//             "",
//           totalAmount: order.pricing?.total || order.total || 0,
//           amount: order.pricing?.total || order.total || 0,
//           paymentMethod: order.payment?.method || "COD",
//           distance: distance,
//           status:
//             order.status === "out_for_delivery"
//               ? "Out for Delivery"
//               : order.status === "arrived"
//               ? "Arrived"
//               : order.status,
//           deliveryOTP: order.deliveryOTP?.code || null,
//           lat:
//             order.address?.lat ??
//             order.address?.location?.coordinates?.[1] ??
//             null,
//           lng:
//             order.address?.lng ??
//             order.address?.location?.coordinates?.[0] ??
//             null,
//         };
//       }));
//     orders = orders.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));

//     res.json({
//       success: true,
//       data: {
//         trip: {
//           _id: trip._id,
//           tripId: trip.tripId,
//           status: trip.status,
//           startTime: trip.startTime,
//           totalEarnings: trip.totalEarnings,
//         },
//         orders,
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };



// exports.markOrderArrived = async (req, res, next) => {
//   try {
//     res.set({
//       "Cache-Control": "no-cache, no-store, must-revalidate, private",
//       Pragma: "no-cache",
//       Expires: "0",
//     });

//     const { orderId } = req.params;
//     const riderId = req.riderId;

//     const order = await Order.findById(orderId).populate(
//       "user",
//       "fullName phone"
//     );

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }

//     if (order.rider?.toString() !== riderId?.toString()) {
//       return res.status(403).json({
//         success: false,
//         message: "You are not assigned to this order",
//       });
//     }

//     if (["arrived", "delivered", "cancelled"].includes(order.status)) {
//       return res.status(400).json({
//         success: false,
//         message: "Order is already completed or cancelled",
//       });
//     }

//     order.status = "arrived";
//     order.timeline.arrivedAt = new Date();
//     await order.save();

//     const deliveryOTP = order.deliveryOTP?.code;
//     const customerPhone =
//       order.user?.phone || order.phone || order.mobile || "";

//     if (deliveryOTP && customerPhone) {
//       try {
//         await sendOTP(customerPhone, deliveryOTP);
//       } catch (err) {}
//     }

//     res.json({
//       success: true,
//       message: "Rider marked as arrived. Customer notified with OTP.",
//       data: {
//         orderId: order._id,
//         status: order.status,
//         arrivedAt: order.timeline.arrivedAt,
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };




// exports.verifyDeliveryOTP = async (req, res, next) => {
//   try {
//     res.set({
//       "Cache-Control": "no-cache, no-store, must-revalidate, private",
//       Pragma: "no-cache",
//       Expires: "0",
//     });

//     const { orderId } = req.params;
//     const { otp } = req.body;
//     const riderId = req.riderId;

//     const order = await Order.findById(orderId).populate("user", "fullName phone");

//     if (!order) {
//       return res.status(404).json({ success: false, message: "Order not found" });
//     }

//     if (order.rider?.toString() !== riderId?.toString()) {
//       return res.status(403).json({ success: false, message: "You are not assigned to this order" });
//     }

//     if (order.status === "delivered") {
//       return res.status(400).json({ success: false, message: "Order already delivered" });
//     }

//     const { hashOTP } = require("../utils/otp");

//     // ✅ maxAttempts check pehle
//     if (order.deliveryOTP.attempts >= order.deliveryOTP.maxAttempts) {
//       return res.status(400).json({
//         success: false,
//         message: "Maximum OTP attempts exceeded",
//         attemptsRemaining: 0,
//       });
//     }

//     // ✅ sha256 se compare
//     const isMatch = hashOTP(otp) === order.deliveryOTP.code;

//     if (!isMatch) {
//       order.deliveryOTP.attempts += 1;
//       await order.save();

//       const remaining = order.deliveryOTP.maxAttempts - order.deliveryOTP.attempts;
//       return res.status(400).json({
//         success: false,
//         message: `Invalid OTP. ${remaining} attempts remaining`,
//         attemptsRemaining: remaining,
//       });
//     }

//     order.status = "delivered";
//     order.deliveryOTP.verifiedAt = new Date();
//     order.timeline.deliveredAt = new Date();
//     await order.save();

//     const trip = await Trip.findById(order.tripId).populate("orderIds");

//     if (trip) {
//       const allDelivered = trip.orderIds.every((o) => o.status === "delivered");

//       if (allDelivered) {
//         trip.status = "Completed";
//         trip.endTime = new Date();
//         await trip.save();

//         await Rider.findByIdAndUpdate(riderId, {
//           status: "Available",
//           currentTripId: null,
//         });

//         return res.json({
//           success: true,
//           message: "Order delivered successfully",
//           tripCompleted: true,
//         });
//       }
//     }

//     res.json({
//       success: true,
//       message: "Order delivered successfully",
//       tripCompleted: false,
//     });
//   } catch (error) {
//     next(error);
//   }
// };



// exports.getRiderHistory = async (req, res, next) => {
//   try {
//     res.set({
//       "Cache-Control": "no-cache, no-store, must-revalidate, private",
//       Pragma: "no-cache",
//       Expires: "0",
//     });

//     const riderId = req.riderId;
//     const { page = 1, limit = 10 } = req.query;

//     const trips = await Trip.find({
//       riderId,
//       status: "Completed",
//     })
//       .populate({
//         path: "orderIds",
//         populate: {
//           path: "user",
//           select: "fullName phone",
//         },
//       })
//       .sort({ endTime: -1 })
//       .limit(limit * 1)
//       .skip((page - 1) * limit);

//     const totalTrips = await Trip.countDocuments({
//       riderId,
//       status: "Completed",
//     });

//     res.json({
//       success: true,
//       data: trips,
//       pagination: {
//         currentPage: parseInt(page),
//         totalPages: Math.ceil(totalTrips / limit),
//         totalTrips,
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };