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


async function getOrCreateUser(phone) {
  let user = await User.findOne({ phone });
  
  if (!user) {
    // Yahan 'fullName' add kar diya gaya hai taaki validation fail na ho
    user = await User.create({ 
      phone, 
      role: "customer", 
      fullName: "Guest" // <-- YEH LINE ADD KARNI HAI
    });
  }
  
  return user;
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
    .select("_id street landmark label")  // ✅ _id add karo
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
}


// tools/orderTools.js

async function saveNewAddress(userId, addressData) {
  // Check if addressData is a valid object
  const isObject = typeof addressData === 'object' && addressData !== null;

  // Safely extract values with fallbacks
  const area = isObject ? addressData.area : addressData;
  const landmark = (isObject && addressData.landmark) ? addressData.landmark : "Added via WhatsApp";

  try {
    // 🔥 Address.create() ki jagah new Address() aur .save() use karna hai
    const newAddress = new Address({
      user: userId,
      street: area || "Unknown Area", 
      landmark: landmark,
      label: "Home",
      lat: 23.2227988, 
      lng: 77.4381391, 
      location: {
        type: "Point",
        coordinates: [77.4381391, 23.2227988] // Longitude pehle, phir Latitude
      }
    });
    
    // Explicitly batana zaroori hai ki location field modified hai
    newAddress.markModified('location');
    
    const savedAddress = await newAddress.save();
    return savedAddress;
    
  } catch (error) {
    console.error("Error saving new address:", error);
    throw error;
  }
}

// 7. Cart Operations (Smart Addition with Price tracking)
async function addItemsToCart(phone, items) {
  const session = await getOrCreateSession(phone);
  const menu = await MenuItem.find({ isAvailable: true });

  for (const it of items) {
    const name = String(it.name || "").toLowerCase();
    // 🔥 Handles both 'qty' and 'quantity' gracefully
    const qty = Math.max(1, parseInt(it.quantity || it.qty || 1));

    const menuItem = menu.find((m) => m.name.toLowerCase().includes(name));
    if (!menuItem) continue; // Agar DB me item na mile toh skip karega

    const existing = session.cart.find((x) => String(x.menuItemId) === String(menuItem._id));
    
    if (existing) {
      existing.quantity += qty; // Purani quantity me nayi quantity add hogi
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

  // Agar cart already khali hai, toh direct return kardo
  if (!session.cart || session.cart.length === 0) {
    return session.cart; 
  }

  for (const it of items) {
    const name = String(it.name || "").toLowerCase().trim();
    // 🔥 Handles 'qty' and 'quantity'. Defaults to removing 1 item if not specified.
    const qtyToRemove = Math.max(1, parseInt(it.quantity || it.qty || 1));

    // Cart me us item ko dhoondo
    const existingIndex = session.cart.findIndex((x) => 
      x.name.toLowerCase().includes(name)
    );

    if (existingIndex !== -1) {
      const existingItem = session.cart[existingIndex];
      
      // Quantity kam karo
      existingItem.quantity -= qtyToRemove;

      // Agar quantity 0 ya usse kam ho jaye, toh item ko cart se poora hata do
      if (existingItem.quantity <= 0) {
        session.cart.splice(existingIndex, 1);
      } else {
        // Warna bachi hui quantity ke hisaab se total price update kardo
        existingItem.total = existingItem.quantity * existingItem.price;
      }
    }
  }
  
  // Database me naya cart save karo
  await session.save();
  return session.cart;
}



async function placeOrder(phone, paymentMethod) {
  const user = await getOrCreateUser(phone);
  const session = await getOrCreateSession(phone);
  
  // 🔥 CRITICAL FIX: Fetch Address using session ID
  let selectedAddress = null;
  if (session.addressId) {
    selectedAddress = await Address.findById(session.addressId); 
  }

  const subtotal = session.cart.reduce((sum, item) => sum + item.total, 0);
  const tax = subtotal * 0.05; // 5% GST
  const total = subtotal + tax;
  const orderNumber = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;

  const newOrder = await Order.create({
    orderNumber,
    user: user._id,
    items: session.cart,
    pricing: { subtotal, tax, total },
    address: {
      fullName: "WhatsApp User",
      phone: phone,
      // 🔥 Yahan address ki details proper set honi chahiye
      street: selectedAddress ? selectedAddress.street : "Store Pickup",
      landmark: selectedAddress ? selectedAddress.landmark : "",
      city: "Default City", 
    },
    payment: { method: paymentMethod, status: paymentMethod === "ONLINE" ? "paid" : "pending" },
    status: "pending",
  });

  // Clear Session Data after order
  session.step = "HOME";
  session.cart = [];
  session.addressId = null; // Next order ke liye clear kar do
  await session.save();

  return newOrder;
}


async function cancelOrder(userId) {
  // Check active order first
  const activeOrder = await getActiveOrder(userId);
  if (activeOrder && ["pending", "preparing", "accepted"].includes(activeOrder.status)) {
    // Update status to cancelled
    const updated = await Order.findByIdAndUpdate(
      activeOrder._id, 
      { status: "cancelled" }, 
      { new: true }
    );
    return updated;
  }
  return null; // Ager order nahi hai ya dispatch ho chuka hai
}







async function processBotOrderAndPayment(userId, phone, cartItems, addressId) {
  try {
    // 1. Total amount calculate karo
    let totalAmount = cartItems.reduce((sum, item) => sum + item.total, 0);
    totalAmount = totalAmount + (totalAmount * 0.05); // 5% tax

    // 🔥 2. Pura Address object fetch karo database se
    const fullAddress = await Address.findById(addressId);
    if (!fullAddress) {
       console.error("Address not found for Order creation");
       return { success: false };
    }

    // 3. Database mein Order Save karo
    const newOrder = new Order({
      user: userId,
      items: cartItems.map(item => ({ 
        name: item.name, 
        price: item.price || item.total/item.quantity, 
        quantity: item.quantity, 
        total: item.total 
      })),
      
      // 🔥 YAHAN FIX HAI: ID ke bajaye poora address object pass karna hai kyunki schema waisa hai
      address: {
        street: fullAddress.street || "Unknown",
        landmark: fullAddress.landmark || "",
        label: fullAddress.label || "Home",
        lat: fullAddress.lat || 0, // Fallback lat
        lng: fullAddress.lng || 0, // Fallback lng
        // Agar nested location object bhi required hai, to isse uncomment karein:
        /* location: {
             type: "Point",
             coordinates: [fullAddress.lng || 0, fullAddress.lat || 0]
           } 
        */
      },
      
      noContact: false,
      paymentStatus: "pending",
      orderStatus: "confirmed",
      totalAmount: totalAmount,
    });
    
    const savedOrder = await newOrder.save();

    // 4. Razorpay PAYMENT LINK create karo
    const paymentLinkReq = {
      amount: Math.round(totalAmount * 100), 
      currency: "INR",
      accept_partial: false,
      description: "Royal Hotel Feast Order",
      customer: { contact: phone },
      notify: { sms: false, email: false },
      reminder_enable: true,
      reference_id: savedOrder._id.toString(), 
    };
    
    const paymentLink = await razorpay.paymentLink.create(paymentLinkReq);

    // 5. Payment Database mein Save karo
    await Payment.create({
      userId: userId,
      orderId: savedOrder._id,
      razorpayOrderId: paymentLink.id, 
      amount: totalAmount,
      status: "created",
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
    // User ka sabse latest order nikalo
    const order = await Order.findOne({ user: userId }).sort({ createdAt: -1 });
    if (!order) return { found: false };

    // Us order se juda hua payment record nikalo
    const payment = await Payment.findOne({ orderId: order._id });
    if (!payment) return { found: true, isPaid: false };

    // Check karo ki database mein captured true hai kya
    const isPaid = payment.status === "captured" || payment.isCaptured === true;

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
    }).populate("items"); // Items populate karna zaroori hai taaki unka naam mil sake
    return offers;
  } catch (error) {
    console.error("Error fetching offers:", error);
    return [];

  }}

module.exports = {
  getOrCreateUser, getOrCreateSession, getActiveOrder,getActiveOffers,
  getCategories, getMenuByCategory, getUserAddresses,
  saveNewAddress, addItemsToCart, placeOrder,cancelOrder, removeItemsFromCart,processBotOrderAndPayment,checkLatestPaymentStatus,
};