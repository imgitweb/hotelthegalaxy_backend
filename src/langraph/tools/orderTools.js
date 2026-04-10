const Session = require("../../models/dining/Session");
const Order = require("../../models/User/ordersModel"); 
const Address = require("../../models/User/address");   
const User = require("../../models/User");         
const MenuItem = require("../../models/dining/menuItemmodel");
const Category = require("../../models/dining/diningCategorymodel"); 
const Payment = require("../../models/paymentModel");
const Offer = require("../../models/Offer");
const DailyRoster = require("../../models/dining/DailyRoster"); 
const razorpay = require("../../config/razorpay"); 
const SubCategory = require("../../models/dining/SubCategory"); 
const Setting = require("../../models/Setting"); 
const Combo = require("../../models/dining/combomodel"); 
const mongoose = require("mongoose");
const axios = require("axios");

function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

async function verifyDeliveryLocation(area, landmark) {
  try {
    const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    const MAX_DISTANCE_KM = parseFloat(process.env.MAX_DISTANCE_KM) || 6;
    const HOTEL_LAT = process.env.HOTEL_LAT || 22.061401;
    const HOTEL_LNG = process.env.HOTEL_LNG || 78.94776;

    const addressQuery = `${area}, ${landmark}`;
    const geoRes = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", { params: { address: addressQuery, key: GOOGLE_API_KEY } });

    if (geoRes.data.status !== "OK" || !geoRes.data.results.length) return { status: false, message: "Aapka address theek se locate nahi ho paya. Kripya thoda aur clear address batayein." };

    const result = geoRes.data.results[0];
    const { lat, lng } = result.geometry.location;
    const formattedAddress = result.formatted_address;

    if (!formattedAddress.toLowerCase().includes("madhya pradesh")) {
      return { status: false, message: `Maaf kijiyega, aapka address '*${formattedAddress}*' Madhya Pradesh se bahar lag raha hai. Humari delivery sirf Madhya Pradesh ke andar available hai.` };
    }

    const distRes = await axios.get("https://maps.googleapis.com/maps/api/distancematrix/json", { params: { origins: `${HOTEL_LAT},${HOTEL_LNG}`, destinations: `${lat},${lng}`, key: GOOGLE_API_KEY } });

    const element = distRes.data.rows[0].elements[0];
    if (element.status !== "OK") return { status: false, message: "Distance calculate karne mein issue aaya. Kripya apna address check karein." };

    const distanceKm = element.distance.value / 1000;
    const distanceText = element.distance.text;

    if (distanceKm <= MAX_DISTANCE_KM) {
      return { status: true, lat, lng, formattedAddress, distanceKm };
    } else {
      return { status: false, message: `Aapka address hotel se *${distanceText}* door hai. Humari max delivery range *${MAX_DISTANCE_KM}km* hai.` };
    }
  } catch (error) { return { status: false, message: "Location check karne mein technical error aaya." }; }
}

async function verifyLocationByCoords(lat, lng) {
  try {
    const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    const MAX_DISTANCE_KM = parseFloat(process.env.MAX_DISTANCE_KM) || 6;
    const HOTEL_LAT = process.env.HOTEL_LAT || 22.061401;
    const HOTEL_LNG = process.env.HOTEL_LNG || 78.94776;

    const distRes = await axios.get("https://maps.googleapis.com/maps/api/distancematrix/json", {
      params: { origins: `${HOTEL_LAT},${HOTEL_LNG}`, destinations: `${lat},${lng}`, key: GOOGLE_API_KEY },
    });

    const element = distRes.data.rows[0].elements[0];
    if (element.status !== "OK") return { status: false, message: "Distance calculate karne mein issue aaya." };

    const distanceKm = element.distance.value / 1000;
    const distanceText = element.distance.text;

    if (distanceKm > MAX_DISTANCE_KM) {
      return { status: false, message: `Aapki location hotel se *${distanceText}* door hai. Humari max delivery range *${MAX_DISTANCE_KM}km* hai.` };
    }

    const geoRes = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
      params: { latlng: `${lat},${lng}`, key: GOOGLE_API_KEY },
    });

    let formattedAddress = "Shared via WhatsApp";
    if (geoRes.data.status === "OK" && geoRes.data.results.length > 0) {
      formattedAddress = geoRes.data.results[0].formatted_address;
    }

    if (!formattedAddress.toLowerCase().includes("madhya pradesh")) {
      return { status: false, message: `Humari delivery sirf Madhya Pradesh ke andar available hai.` };
    }

    return { status: true, lat, lng, formattedAddress, distanceKm };
  } catch (error) {
    return { status: false, message: "Location check karne mein technical error aaya." };
  }
}

async function checkUserExists(phone) { return await User.findOne({ phone }); }
async function registerNewUser(phone, fullName) { return await User.create({ phone, role: "customer", fullName: fullName || "Guest", authProvider: "whatsapp", isActive: true }); }
async function getOrCreateSession(phone) { let session = await Session.findOne({ phone }); if (!session) session = await Session.create({ phone, cart: [] }); return session; }
async function getActiveOrder(userId) { return await Order.findOne({ user: userId, status: { $nin: ["delivered", "cancelled"] } }).sort({ createdAt: -1 }).lean(); }

async function getActiveOrdersToday(userId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return await Order.find({ 
        user: userId, 
        createdAt: { $gte: today },
        status: { $nin: ["delivered", "cancelled", "rejected"] } 
    }).sort({ createdAt: -1 }).lean();
  } catch (error) { return []; }
}

async function getCategories() { 
  const cats = await Category.find({ isActive: true }).lean(); 
  const comboCount = await Combo.countDocuments({});
  if (comboCount > 0) {
    cats.unshift({ _id: "combos_virtual", name: "Special Combos" });
  }
  return cats;
}

async function getTodayRosterItems() { 
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const roster = await DailyRoster.findOne({ date: { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) } }).populate("items.id"); 
  
  let activeOffers = [];
  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    activeOffers = await Offer.find({ 
        isActive: true,
        startDate: { $lte: now }, 
        endDate: { $gte: startOfToday }
    }).lean();
  } catch(e) { console.error("Offer fetch error:", e); }

  let items = [];
  
  if (roster && roster.items) {
    const regularItems = roster.items.filter(item => item.id && item.quantity > 0).map(item => {
      let originalPrice = item.id.basePrice;
      let finalPrice = originalPrice;
      let appliedOffer = null;

      for(let offer of activeOffers) {
        if (offer.items && offer.items.map(i => String(i)).includes(String(item.id._id))) {
          if (offer.discountType === "PERCENTAGE") {
            finalPrice = finalPrice - (finalPrice * offer.discountValue / 100);
          } else if (offer.discountType === "FLAT") {
            finalPrice = finalPrice - offer.discountValue;
          }
          appliedOffer = offer.name;
          break; 
        }
      }
      finalPrice = Math.max(0, Math.round(finalPrice));

      return { 
        _id: item.id._id, 
        name: item.id.name, 
        basePrice: finalPrice, 
        originalPrice: originalPrice, 
        category: item.id.category, 
        maxAllowed: item.quantity, 
        availableNow: item.quantity,
        isCombo: false,
        offerName: appliedOffer
      };
    });
    items.push(...regularItems);
  }

  try {
      const combos = await Combo.find({}).populate("items.item", "name").lean();
      
      const comboItems = combos.map(c => {
         let originalPrice = c.price;
         let finalPrice = originalPrice;
         let appliedOffer = null;

         for(let offer of activeOffers) {
           if (offer.combos && offer.combos.map(id => String(id)).includes(String(c._id))) {
             if (offer.discountType === "PERCENTAGE") {
               finalPrice = finalPrice - (finalPrice * offer.discountValue / 100);
             } else if (offer.discountType === "FLAT") {
               finalPrice = finalPrice - offer.discountValue;
             }
             appliedOffer = offer.name;
             break;
           }
         }
         finalPrice = Math.max(0, Math.round(finalPrice));

         let includedNames = "";
         if (c.items && c.items.length > 0) {
             includedNames = c.items.map(i => i.item && i.item.name ? i.item.name : "").filter(Boolean).join(" + ");
         }

         return {
             _id: c._id,
             name: `${c.name}`, 
             basePrice: finalPrice,
             originalPrice: originalPrice,
             category: "combos_virtual",
             maxAllowed: 10, 
             availableNow: 10,
             isCombo: true,
             offerName: appliedOffer,
             includedItems: includedNames 
         };
      });
      items.push(...comboItems);
  } catch(e) { console.log("Combo fetch error:", e); }

  return items;
}

async function searchTodayRosterItems(searchTerm) {
  if (!searchTerm) return [];
  const term = searchTerm.toLowerCase().trim();
  const allItems = await getTodayRosterItems();
  return allItems.filter(item => item.name.toLowerCase().includes(term));
}

async function getAvailableCategoriesToday() {
  try {
    const rosterItems = await getTodayRosterItems();
    if (!rosterItems.length) return [];

    const rosterItemIds = rosterItems.filter(i => !i.isCombo).map(item => item._id);
    const menuItems = await MenuItem.find({ _id: { $in: rosterItemIds } }).lean();
    
    const subCatIds = [...new Set(menuItems.map(m => String(m.subCategory)))];
    const subCats = await SubCategory.find({ _id: { $in: subCatIds } }).lean();
    
    const categoryIds = [...new Set(subCats.map(sc => String(sc.category)))];
    const categories = await Category.find({ _id: { $in: categoryIds }, isActive: true }).lean();

    const hasCombos = rosterItems.some(i => i.isCombo);
    if (hasCombos) {
      categories.unshift({ _id: "combos_virtual", name: "Special Combos" });
    }

    return categories;
  } catch (error) {
    return [];
  }
}

async function getMenuByCategory(categoryId) { 
  try {
    const rosterItems = await getTodayRosterItems();
    
    if (categoryId === "combos_virtual") {
       return rosterItems.filter(item => item.isCombo);
    }

    const subCategories = await SubCategory.find({ category: categoryId }).lean();
    const subCategoryIds = subCategories.map(sc => String(sc._id));
    if (subCategoryIds.length === 0) return [];
    
    const menuItems = await MenuItem.find({ subCategory: { $in: subCategoryIds } }).lean();
    const menuItemIds = menuItems.map(item => String(item._id));
    if (menuItemIds.length === 0) return [];
    
    return rosterItems.filter(rosterItem => !rosterItem.isCombo && menuItemIds.includes(String(rosterItem._id)));
  } catch (error) { return []; }
}

async function getUserAddresses(userId) { return await Address.find({ user: userId }).select("_id street landmark label lat lng").sort({ isDefault: -1, createdAt: -1 }).lean(); }

async function saveNewAddress(userId, addressData, lat, lng) {
  const isObject = typeof addressData === 'object' && addressData !== null;
  const area = isObject ? addressData.area : addressData;
  const landmark = (isObject && addressData.landmark) ? addressData.landmark : "Added via WhatsApp";
  try {
    const newAddress = new Address({ user: userId, street: area || "Unknown Area", landmark: landmark, label: "Home", lat: lat || 22.061401, lng: lng || 78.94776, location: { type: "Point", coordinates: [lng || 78.94776, lat || 22.061401] } });
    newAddress.markModified('location');
    return await newAddress.save();
  } catch (error) { throw error; }
}

async function addItemsToCart(phone, items) { 
  const session = await getOrCreateSession(phone); const rosterItems = await getTodayRosterItems(); let feedbackMessages = []; 
  const setting = await Setting.findOne() || { baseFee: 30, freeDeliveryAbove: 500 }; 

  for (const it of items) {
    const name = String(it.name || "").toLowerCase(); const qtyRequested = Math.max(1, parseInt(it.quantity || it.qty || 1));
    const rosterItem = rosterItems.find((m) => m.name.toLowerCase().includes(name));
    
    if (!rosterItem) { 
      const partialMatch = rosterItems.find(m => m.name.toLowerCase() === name);
      if(!partialMatch) {
         feedbackMessages.push(`❌ *${it.name}* abhi available nahi hai.`); continue; 
      }
    }
    
    const itemToAdd = rosterItem;

    let finalName = itemToAdd.name;
    if (itemToAdd.isCombo && itemToAdd.includedItems) {
        finalName = `${itemToAdd.name} (${itemToAdd.includedItems})`;
    }

    const existing = session.cart.find((x) => String(x.menuItemId) === String(itemToAdd._id));
    const currentCartQty = existing ? existing.quantity : 0; const newTotalQty = currentCartQty + qtyRequested;
    if (newTotalQty > itemToAdd.maxAllowed) {
       const allowedToAdd = itemToAdd.maxAllowed - currentCartQty;
       if (allowedToAdd > 0) {
           feedbackMessages.push(`⚠️ *${itemToAdd.name}* ke liye aap max *${itemToAdd.maxAllowed}* order kar sakte hain.`);
           if (existing) { existing.quantity += allowedToAdd; existing.total = existing.quantity * existing.price; } 
           else { session.cart.push({ menuItemId: itemToAdd._id, isCombo: itemToAdd.isCombo, name: finalName, price: itemToAdd.basePrice, quantity: allowedToAdd, total: itemToAdd.basePrice * allowedToAdd }); }
       } else { feedbackMessages.push(`⚠️ Aap already *${itemToAdd.name}* ki maximum limit cart mein add chuke hain.`); }
    } else {
       feedbackMessages.push(`✅ *${qtyRequested}x ${itemToAdd.name}* cart mein add ho gaya.`);
       if (existing) { existing.quantity += qtyRequested; existing.total = existing.quantity * existing.price; } 
       else { session.cart.push({ menuItemId: itemToAdd._id, isCombo: itemToAdd.isCombo, name: finalName, price: itemToAdd.basePrice, quantity: qtyRequested, total: itemToAdd.basePrice * qtyRequested }); }
    }
  }
  session.markModified('cart'); 
  await session.save(); 
  return { cart: session.cart, messages: feedbackMessages, setting }; 
}

async function removeItemsFromCart(phone, items) { 
  const session = await getOrCreateSession(phone); 
  const setting = await Setting.findOne() || { baseFee: 30, freeDeliveryAbove: 500 }; 
  if (!session.cart || session.cart.length === 0) return { cart: session.cart, setting }; 

  for (const it of items) {
    const name = String(it.name || "").toLowerCase().trim(); const qtyToRemove = Math.max(1, parseInt(it.quantity || it.qty || 1));
    const existingIndex = session.cart.findIndex((x) => x.name.toLowerCase().includes(name));
    if (existingIndex !== -1) {
      const existingItem = session.cart[existingIndex]; 
      existingItem.quantity -= qtyToRemove;
      if (existingItem.quantity <= 0) { session.cart.splice(existingIndex, 1); } 
      else { existingItem.total = existingItem.quantity * existingItem.price; }
    }
  }
  session.markModified('cart'); 
  await session.save(); 
  return { cart: session.cart, setting };
}

async function placeOrder(phone, paymentMethod) {
  let user = await checkUserExists(phone); if (!user) user = await registerNewUser(phone, "Guest"); 
  const session = await getOrCreateSession(phone); let selectedAddress = null;
  if (session.addressId) { selectedAddress = await Address.findById(session.addressId); }
  const subtotal = session.cart.reduce((sum, item) => sum + item.total, 0);
  
  const setting = await Setting.findOne() || { baseFee: 30, freeDeliveryAbove: 500 }; 
  const deliveryCharge = subtotal >= setting.freeDeliveryAbove ? 0 : setting.baseFee;
  const total = subtotal + deliveryCharge; 
  const orderNumber = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
  
  const newOrder = await Order.create({

    orderNumber, user: user._id, items: session.cart, 
    pricing: { subtotal, deliveryCharge, tax: 0, total }, 
    address: { fullName: user.fullName || "WhatsApp User", phone: phone, street: selectedAddress ? selectedAddress.street : "Store Pickup", landmark: selectedAddress ? selectedAddress.landmark : "", city: "Madhya Pradesh" },
    payment: { method: paymentMethod, status: paymentMethod === "ONLINE" ? "paid" : "pending" }, status: "pending",

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
  session.step = "HOME"; session.cart = []; session.addressId = null; await session.save();
  return newOrder;
}

async function cancelOrder(userId) { 
  const activeOrder = await getActiveOrder(userId);
  if (activeOrder && ["pending", "preparing", "accepted"].includes(activeOrder.status)) { return await Order.findByIdAndUpdate(activeOrder._id, { status: "cancelled" }, { new: true }); }
  return null; 
}

async function getUserOrderStats(userId) { 
  try {
    const orders = await Order.find({ user: userId }); let totalOrders = orders.length; let deliveredOrders = 0; let cancelledOrders = 0; let totalSpent = 0;
    orders.forEach(order => {
        const status = order.status ? order.status.toLowerCase() : "";
        if (status === "delivered") deliveredOrders++; if (status === "cancelled") cancelledOrders++;
        if (["confirmed", "preparing", "dispatched", "out_for_delivery", "delivered"].includes(status)) { totalSpent += (order.totalAmount || order.pricing?.total || 0); }
    });
    return { totalOrders, deliveredOrders, cancelledOrders, totalSpent };
  } catch (error) { return { totalOrders: 0, deliveredOrders: 0, cancelledOrders: 0, totalSpent: 0 }; }
}

async function processBotOrderAndPayment(userId, phone, cartItems, addressId, distanceKm = null) { 
  try {
    const fullAddress = await Address.findById(addressId); if (!fullAddress) return { success: false };
    
    let finalDistance = distanceKm;
    if (finalDistance === null || finalDistance === undefined) {
      const HOTEL_LAT = process.env.HOTEL_LAT || 22.061401;
      const HOTEL_LNG = process.env.HOTEL_LNG || 78.94776;
      finalDistance = calculateDistance(HOTEL_LAT, HOTEL_LNG, fullAddress.lat, fullAddress.lng);
    }
    finalDistance = Math.round(finalDistance * 100) / 100;

    const setting = await Setting.findOne() || { baseFee: 30, perKmRate: 10, baseDistanceKm: 5, minCharge: 20, maxCharge: 200, freeDeliveryAbove: 500 };
    const subtotal = cartItems.reduce((sum, item) => sum + item.total, 0); 
    
    let deliveryCharge = 0;
    if (subtotal < setting.freeDeliveryAbove) {
      deliveryCharge = setting.baseFee;
      if (finalDistance > setting.baseDistanceKm) {
        deliveryCharge += (finalDistance - setting.baseDistanceKm) * setting.perKmRate;
      }
      if (deliveryCharge < setting.minCharge) deliveryCharge = setting.minCharge;
      if (deliveryCharge > setting.maxCharge) deliveryCharge = setting.maxCharge;
    }
    deliveryCharge = Math.round(deliveryCharge);
    const totalAmount = subtotal + deliveryCharge;

    const uniqueOrderNumber = "ORD-" + Date.now() + "-" + Math.floor(Math.random() * 1000);

    const newOrder = new Order({
      orderNumber: uniqueOrderNumber, orderSource: "whatsapp", user: userId,
      items: cartItems.map(item => ({ menuItem: item.isCombo ? null : item.menuItemId, combo: item.isCombo ? item.menuItemId : null, name: item.name, price: item.price || (item.total / item.quantity), quantity: item.quantity, total: item.total })),
      address: { street: fullAddress.street || "Unknown", landmark: fullAddress.landmark || "", label: fullAddress.label || "Home", lat: fullAddress.lat || 0, lng: fullAddress.lng || 0 },
      pricing: { subtotal: subtotal, deliveryCharge: deliveryCharge, tax: 0, total: totalAmount }, 
      totalAmount: totalAmount, noContact: false, paymentStatus: "pending", orderStatus: "confirmed",
      distanceKm: finalDistance, distance: finalDistance
    });
    
    const savedOrder = await newOrder.save();
    
    const paymentLinkReq = { amount: Math.round(totalAmount * 100), currency: "INR", accept_partial: false, description: "Galaxy Hotel Feast Order", customer: { contact: phone }, notify: { sms: false, email: false }, reminder_enable: true, reference_id: savedOrder._id.toString(), notes: { dbOrderId: savedOrder._id.toString(), phone: phone } };
    const paymentLink = await razorpay.paymentLink.create(paymentLinkReq);
    await Payment.create({ order: savedOrder._id, amount: totalAmount, gateway: "RAZORPAY", status: "created", metadata: { razorpayOrderId: paymentLink.id, userId: userId } });
    
    return { success: true, orderId: savedOrder._id, paymentUrl: paymentLink.short_url, totalAmount, subtotal, deliveryCharge };
  } catch (error) { return { success: false }; }
}

async function checkLatestPaymentStatus(userId) { 
  try {
    const order = await Order.findOne({ user: userId }).sort({ createdAt: -1 }); if (!order) return { found: false };
    const payment = await Payment.findOne({ order: order._id }); if (!payment) return { found: true, isPaid: false };
    const isPaid = payment.status === "SUCCESS" || payment.isCaptured === true;
    return { found: true, isPaid: isPaid, orderNumber: order.orderNumber || order._id, orderId: order._id };
  } catch (error) { return { found: false }; }
}

async function getActiveOffers() {
  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    const offers = await Offer.find({ 
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: startOfToday } 
    }).populate("items", "name basePrice").populate("combos", "name price").lean(); 
    
    const combos = await Combo.find({}).populate("items.item", "name").lean();

    return { offers, combos };
  } catch (error) { return { offers: [], combos: [] }; }
}

module.exports = {
  checkUserExists, registerNewUser, getOrCreateSession, getActiveOrder, getActiveOrdersToday, getActiveOffers,
  getCategories, getMenuByCategory, getUserAddresses, getUserOrderStats, getTodayRosterItems, 
  searchTodayRosterItems, getAvailableCategoriesToday, saveNewAddress, addItemsToCart, 
  placeOrder, cancelOrder, removeItemsFromCart, processBotOrderAndPayment, 
  checkLatestPaymentStatus, verifyDeliveryLocation, verifyLocationByCoords
};