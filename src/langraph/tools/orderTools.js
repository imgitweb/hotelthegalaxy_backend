const Session = require("../../models/dining/Session");
const Order = require("../../models/User/ordersModel"); 
const Address = require("../../models/User/address");   
const User = require("../../models/User");         
const MenuItem = require("../../models/dining/menuItemmodel");
const Category = require("../../models/dining/diningCategorymodel"); 
const Payment = require("../../models/paymentModel");
const Offer = require("../../models/Offer");
const razorpay = require("../../config/razorpay"); 
const mongoose = require("mongoose");

// 🔥 NEW: Check if user exists
async function checkUserExists(phone) {
  return await User.findOne({ phone });
}

// 🔥 NEW: Register user with exact schema requirements
async function registerNewUser(phone, fullName) {

  if (!phone.startsWith("+")) {
    phone = "+" + phone;
  }

  
  return await User.create({ 
    phone, 
    role: "customer", 
    fullName: fullName || "Guest",
    authProvider: "whatsapp",
    isActive: true
  });
}

// 2. Session Management
async function getOrCreateSession(phone) {
  let session = await Session.findOne({ phone });
  if (!session) session = await Session.create({ phone, cart: [] });
  return session;
}

// 3. Check for Active Orders
async function getActiveOrder(userId) {
  return await Order.findOne({ 
    user: userId, 
    status: { $nin: ["delivered", "cancelled"] } 
  }).sort({ createdAt: -1 }).lean();
}

// 4. Get Categories
async function getCategories() {
  return await Category.find({ isActive: true }).lean();
}

// 5. Fetch Items by Category
async function getMenuByCategory(categoryId) {
  return await MenuItem.find({ category: categoryId, isAvailable: true }).lean();
}

// 6. Address Management
async function getUserAddresses(userId) {
  return await Address.find({ user: userId })
    .select("_id street landmark label")
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
}

async function saveNewAddress(userId, addressData) {
  const isObject = typeof addressData === 'object' && addressData !== null;
  const area = isObject ? addressData.area : addressData;
  const landmark = (isObject && addressData.landmark) ? addressData.landmark : "Added via WhatsApp";

  try {
    const newAddress = new Address({
      user: userId,
      street: area || "Unknown Area", 
      landmark: landmark,
      label: "Home",
      lat: 23.2227988, 
      lng: 77.4381391, 
      location: {
        type: "Point",
        coordinates: [77.4381391, 23.2227988] 
      }
    });
    
    newAddress.markModified('location');
    const savedAddress = await newAddress.save();
    return savedAddress;
  } catch (error) {
    console.error("Error saving new address:", error);
    throw error;
  }
}

// 7. Cart Operations
async function addItemsToCart(phone, items) {
  const session = await getOrCreateSession(phone);
  const menu = await MenuItem.find({ isAvailable: true });

  for (const it of items) {
    const name = String(it.name || "").toLowerCase();
    const qty = Math.max(1, parseInt(it.quantity || it.qty || 1));

    const menuItem = menu.find((m) => m.name.toLowerCase().includes(name));
    if (!menuItem) continue; 

    const existing = session.cart.find((x) => String(x.menuItemId) === String(menuItem._id));
    
    if (existing) {
      existing.quantity += qty; 
      existing.total = existing.quantity * existing.price;
    } else {
      session.cart.push({
        menuItemId: menuItem._id,
        name: menuItem.name,
        price: menuItem.basePrice,
        quantity: qty,
        total: menuItem.basePrice * qty
      });
    }
  }
  
  await session.save();
  return session.cart;
}

async function removeItemsFromCart(phone, items) {
  const session = await getOrCreateSession(phone);

  if (!session.cart || session.cart.length === 0) return session.cart; 

  for (const it of items) {
    const name = String(it.name || "").toLowerCase().trim();
    const qtyToRemove = Math.max(1, parseInt(it.quantity || it.qty || 1));

    const existingIndex = session.cart.findIndex((x) => x.name.toLowerCase().includes(name));

    if (existingIndex !== -1) {
      const existingItem = session.cart[existingIndex];
      existingItem.quantity -= qtyToRemove;

      if (existingItem.quantity <= 0) {
        session.cart.splice(existingIndex, 1);
      } else {
        existingItem.total = existingItem.quantity * existingItem.price;
      }
    }
  }
  
  await session.save();
  return session.cart;
}

async function placeOrder(phone, paymentMethod) {
  let user = await checkUserExists(phone);
  if (!user) user = await registerNewUser(phone, "Guest"); // Fallback
  
  const session = await getOrCreateSession(phone);
  
  let selectedAddress = null;
  if (session.addressId) {
    selectedAddress = await Address.findById(session.addressId); 
  }

  const subtotal = session.cart.reduce((sum, item) => sum + item.total, 0);
  const tax = subtotal * 0.05; 
  const total = subtotal + tax;
  const orderNumber = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;

  const newOrder = await Order.create({
    orderNumber,
    user: user._id,
    items: session.cart,
    pricing: { subtotal, tax, total },
    address: {
      fullName: user.fullName || "WhatsApp User",
      phone: phone,
      street: selectedAddress ? selectedAddress.street : "Store Pickup",
      landmark: selectedAddress ? selectedAddress.landmark : "",
      city: "Default City", 
    },
    payment: { method: paymentMethod, status: paymentMethod === "ONLINE" ? "paid" : "pending" },
    status: "pending",
  });

  session.step = "HOME";
  session.cart = [];
  session.addressId = null; 
  await session.save();

  return newOrder;
}

async function cancelOrder(userId) {
  const activeOrder = await getActiveOrder(userId);
  if (activeOrder && ["pending", "preparing", "accepted"].includes(activeOrder.status)) {
    return await Order.findByIdAndUpdate(activeOrder._id, { status: "cancelled" }, { new: true });
  }
  return null; 
}

async function getUserOrderStats(userId) {
  try {
    const orders = await Order.find({ user: userId });
    
    let totalOrders = orders.length;
    let deliveredOrders = 0;
    let cancelledOrders = 0;
    let totalSpent = 0;

    orders.forEach(order => {
        const status = order.status ? order.status.toLowerCase() : "";
        if (status === "delivered") deliveredOrders++;
        if (status === "cancelled") cancelledOrders++;
        if (["confirmed", "preparing", "dispatched", "out_for_delivery", "delivered"].includes(status)) {
            totalSpent += (order.totalAmount || order.pricing?.total || 0);
        }
    });

    return { totalOrders, deliveredOrders, cancelledOrders, totalSpent };
  } catch (error) {
    console.error("Error fetching order stats:", error);
    return { totalOrders: 0, deliveredOrders: 0, cancelledOrders: 0, totalSpent: 0 };
  }
}

async function processBotOrderAndPayment(userId, phone, cartItems, addressId) {
  try {
    const subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * 0.05; 
    const totalAmount = subtotal + tax;

    const fullAddress = await Address.findById(addressId);
    if (!fullAddress) return { success: false };

    const uniqueOrderNumber = "ORD-" + Date.now() + "-" + Math.floor(Math.random() * 1000);

    const newOrder = new Order({
      orderNumber: uniqueOrderNumber, 
      user: userId,
      items: cartItems.map(item => ({ 
        menuItem: item.menuItemId, 
        name: item.name, 
        price: item.price || (item.total / item.quantity), 
        quantity: item.quantity, 
        total: item.total 
      })),
      address: {
        street: fullAddress.street || "Unknown",
        landmark: fullAddress.landmark || "",
        label: fullAddress.label || "Home",
        lat: fullAddress.lat || 0, 
        lng: fullAddress.lng || 0, 
      },
      pricing: { subtotal: subtotal, tax: tax, total: totalAmount },
      totalAmount: totalAmount, 
      noContact: false,
      paymentStatus: "pending",
      orderStatus: "confirmed",
    });
    
    const savedOrder = await newOrder.save();

    const paymentLinkReq = {
      amount: Math.round(totalAmount * 100), 
      currency: "INR",
      accept_partial: false,
      description: "Royal Hotel Feast Order",
      customer: { contact: phone },
      notify: { sms: false, email: false },
      reminder_enable: true,
      reference_id: savedOrder._id.toString(), 
      notes: { dbOrderId: savedOrder._id.toString(), phone: phone }
    };
    
    const paymentLink = await razorpay.paymentLink.create(paymentLinkReq);

    await Payment.create({
      order: savedOrder._id,     
      amount: totalAmount,
      gateway: "RAZORPAY",
      status: "created",         
      metadata: { razorpayOrderId: paymentLink.id, userId: userId }
    });

    return {
      success: true,
      orderId: savedOrder._id,
      paymentUrl: paymentLink.short_url,
      totalAmount
    };
  } catch (error) {
    console.error("Payment Link Error:", error);
    return { success: false };
  }
}

async function checkLatestPaymentStatus(userId) {
  try {
    const order = await Order.findOne({ user: userId }).sort({ createdAt: -1 });
    if (!order) return { found: false };

    const payment = await Payment.findOne({ order: order._id });
    if (!payment) return { found: true, isPaid: false };

    const isPaid = payment.status === "SUCCESS" || payment.isCaptured === true;

    return {
      found: true,
      isPaid: isPaid,
      orderNumber: order.orderNumber || order._id,
      orderId: order._id
    };
  } catch (error) {
    console.error("Error checking payment status:", error);
    return { found: false };
  }
}

async function getActiveOffers() {
  const now = new Date();
  try {
    const offers = await Offer.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).populate("items"); 
    return offers;
  } catch (error) {
    console.error("Error fetching offers:", error);
    return [];
  }
}

// 🔥 EXPORTS UPDATED
module.exports = {
  checkUserExists, registerNewUser, getOrCreateSession, getActiveOrder, getActiveOffers,
  getCategories, getMenuByCategory, getUserAddresses, getUserOrderStats,
  saveNewAddress, addItemsToCart, placeOrder, cancelOrder, removeItemsFromCart, 
  processBotOrderAndPayment, checkLatestPaymentStatus,
};