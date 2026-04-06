const Session = require("../../models/dining/Session");
const Order = require("../../models/User/ordersModel"); 
const Address = require("../../models/User/address");   
const User = require("../../models/User");         
const MenuItem = require("../../models/dining/menuItemmodel");
const Category = require("../../models/dining/diningCategorymodel"); 
const mongoose = require("mongoose");

// 1. Get or Create User
async function getOrCreateUser(phone) {
  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({ phone, role: "customer" });
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


async function saveNewAddress(userId, addressData) {
  // Extracting from AI Object
  const area = typeof addressData === 'object' ? addressData.area : addressData;
  const landmark = typeof addressData === 'object' ? addressData.landmark : "Added via WhatsApp";

  const newAddress = await Address.create({
    user: userId,
    street: area || "Unknown Area", 
    landmark: landmark,
    label: "Home"
  });
  return newAddress;
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
    source: "whatsapp",
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

module.exports = {
  getOrCreateUser, getOrCreateSession, getActiveOrder,
  getCategories, getMenuByCategory, getUserAddresses,
  saveNewAddress, addItemsToCart, placeOrder,cancelOrder, removeItemsFromCart,
};