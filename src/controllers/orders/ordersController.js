const Order = require("../../models/User/ordersModel");
const MenuItem = require("../../models/dining/menuItemmodel");
const DailyRoster = require("../../models/dining/DailyRoster");
const Combo = require("../../models/dining/combomodel");
const Review = require("../../models/reviewModel");
const Address = require("../../models/User/address");
const getDistanceKm = require("../../utils/distanceService");
const { calculateETA } = require("../../utils/calculateETA");
const Payment = require("../../models/paymentModel");

const HOTEL_LOCATION = {
  lat: 22.061401,
  lng: 78.94776,
};


exports.createOrder = async (req, res, next) => {
  try {
    const { items, addressId } = req.body;
    console.log("$$ items", items, addressId)
    const userId = req.user._id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No items provided",
      });
    }

    let selectedAddress = null;
    if (addressId) {
      selectedAddress = await Address.findById(addressId);

      if (!selectedAddress) {
        return res.status(404).json({
          success: false,
          message: "Address not found",
        });
      }
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      if (!item.quantity || item.quantity < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid quantity",
        });
      }

      if (!!item.menuItem === !!item.combo) {
        return res.status(400).json({
          success: false,
          message: "Each item must have either menuItem or combo",
        });
      }

      if (item.menuItem) {
        const menuItem = await MenuItem.findById(item.menuItem);
        if (!menuItem) {
          return res
            .status(404)
            .json({ success: false, message: "Menu item not found" });
        }

        const price = menuItem.basePrice;
        const total = price * item.quantity;
        subtotal += total;

        // orderItems.push({
        //   menuItem: menuItem._id,
        //   name: menuItem.name,
        //   price,
        //   quantity: item.quantity,
        //   total,
        // });
    
orderItems.push({
  menuItem: menuItem._id,
  name: menuItem.name,
  price,
  quantity: item.quantity,
  total: price * item.quantity,
  image: menuItem.images?.[0]?.url || null, // ✅ CRITICAL
});
      }

      if (item.combo) {
        const combo = await Combo.findById(item.combo);
        if (!combo) {
          return res
            .status(404)
            .json({ success: false, message: "Combo not found" });
        }

        const price = combo.price;
        const total = price * item.quantity;
        subtotal += total;

        orderItems.push({
          combo: combo._id,
          name: combo.name,
          price,
          quantity: item.quantity,
          total,
        });
      }
    }

    // Default values if no address provided
    const userLocation = selectedAddress
      ? { lat: selectedAddress.lat, lng: selectedAddress.lng }
      : { lat: 0, lng: 0 };

    const distanceKm = selectedAddress
      ? await getDistanceKm(HOTEL_LOCATION, userLocation)
      : 0;
    const deliveryCharge = calculateDeliveryCharge(distanceKm, subtotal);

    const tax = Math.round(subtotal * 0.05);
    const total = subtotal + tax + deliveryCharge;

    const order = await Order.create({
      orderNumber: "ORD-" + Date.now(),
      user: req.user.id,
      items: orderItems,
      pricing: {
        subtotal,
        tax,
        deliveryCharge,
        total,
      },
      distanceKm,
      eta: selectedAddress
        ? (await calculateETA({ address: userLocation, status: "pending" })).eta
        : null,
      address: selectedAddress
        ? {
            street: selectedAddress.street,
            landmark: selectedAddress.landmark,
            lat: selectedAddress.lat,
            lng: selectedAddress.lng,
            location: selectedAddress.location,
          }
        : {},
      status: "pending",
    });

    res.status(201).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("Create Order Error:", error.message);
    next(error);
  }
};


exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate("items.menuItem", "name basePrice images")
      .populate("items.combo", "name price image")
      .sort({ createdAt: -1 })
      .lean();

    const orderIds = orders.map((o) => o._id);

    const reviews = await Review.find({
      order: { $in: orderIds },
      user: req.user.id,
    }).lean();

    const reviewMap = {};
    reviews.forEach((r) => {
      reviewMap[r.order.toString()] = r;
    });

    const ordersWithReviews = orders.map((order) => ({
      ...order,
      review: reviewMap[order._id.toString()] || null,
    }));

    res.status(200).json({
      success: true,
      data: ordersWithReviews,
    });
  } catch (error) {
    next(error);
  }
};

exports.getOrderById = async (req, res, next) => {
  try {
    const id = req.params.id;

    const order = await Order.findById(id)
      .populate("items.menuItem", "name basePrice images user")
      .populate("items.combo", "name price image");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!req.user || order.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    const etaData = await calculateETA(order);
    order.eta = etaData.eta;
    order.distanceKm = etaData.distanceKm;

    await order.save();

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.log("Get Order By ID Error:", error);
    next(error);
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",clear
      });
    }

    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to cancel this order",
      });
    }

    const cancellableStatuses = ["pending", "confirmed"];

    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled at this stage",
      });
    }

    if (order.rider) {
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled because rider is already assigned",
      });
    }

    order.status = "cancelled";
    await order.save();

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      order,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ["cancelled"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status",
      });
    }

    const order = await Order.findByIdAndUpdate(id, { status }, { new: true });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};