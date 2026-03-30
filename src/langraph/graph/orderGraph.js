const { StateGraph } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");
const { z } = require("zod");

const {
  getOrCreateUser, getOrCreateSession, getActiveOrder,
  getCategories, getMenuByCategory, getUserAddresses,
  saveNewAddress, addItemsToCart, placeOrder, getUserOrderStats,
  cancelOrder, removeItemsFromCart
} = require("../tools/orderTools");

// ---------------- 1. AI AGENT SETUP ---------------- //
const llm = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0 });

const IntentSchema = z.object({
  intent: z.enum([
    "GREETING", 
    "SHOW_MENU", "ADD_TO_CART", "REMOVE_FROM_CART", "CHECKOUT", "PROVIDE_ADDRESS", 
    "TRACK_ORDER", "ORDER_STATS", "CANCEL_ORDER", 
    "HELP", "UNKNOWN", "SELECT_SAVED_ADDRESS"
  ]).describe("Identify the core intent of the user's message."),
  
  extracted_items: z.array(z.object({
    name: z.string().describe("Food item name"),
    quantity: z.number().describe("Quantity")
  })).describe("Extract ALL food items and quantities. Used for both ADD and REMOVE intents. Return [] if none."),
  
  address: z.object({
    area: z.string(),
    landmark: z.string()
  }).nullable().describe("Extract area and landmark if user gives an address."),

  address_index: z.number().nullable().describe("If user types '1' or '2' to select an address, extract the number here.")
});

const aiBrain = llm.withStructuredOutput(IntentSchema, { strict: true });

// ---------------- 2. THE BRAIN NODE ---------------- //
async function agentDecisionNode(state) {
  const msg = (state.inputText || "").trim().toLowerCase();
  
  // 🔥 Fast Routing (Buttons)
  if (["hi", "hello", "start", "menu", "home"].includes(msg)) return { ...state, aiIntent: "GREETING" };
  if (msg === "btn_order" || msg === "btn_add_more") return { ...state, aiIntent: "SHOW_MENU" };
  if (msg === "btn_track") return { ...state, aiIntent: "TRACK_ORDER" };
  if (msg === "btn_help") return { ...state, aiIntent: "HELP" };
  if (msg === "btn_checkout") return { ...state, aiIntent: "CHECKOUT" };
  if (msg === "btn_new_address") return { ...state, aiIntent: "ASK_ADDRESS" };
  if (msg === "btn_cancel_order") return { ...state, aiIntent: "CANCEL_ORDER" }; 
  
  if (msg.startsWith("cat_")) return { ...state, aiIntent: "SHOW_CATEGORY_ITEMS", aiData: { categoryId: msg.split("_")[1] } };
  
  // 🔥 Direct Address Button Selection
  if (msg.startsWith("addr_")) {
    return { ...state, aiIntent: "CHOOSE_PAYMENT", aiData: { addressId: msg.split("_")[1] } };
  }
  
  // 🔥 Payment Flow Routing
  if (msg === "pay_online") return { ...state, aiIntent: "INITIATE_UPI_PAYMENT" };
  if (msg === "btn_paid") return { ...state, aiIntent: "COMPLETE_ORDER", aiData: { method: "ONLINE" } };
  if (msg === "pay_cod") return { ...state, aiIntent: "COMPLETE_ORDER", aiData: { method: "COD" } };

  // 🔥 Smart Routing for Numbers (Address Selection via Chat)
  if (msg === "1" || msg === "2") {
     return { ...state, aiIntent: "SELECT_SAVED_ADDRESS", aiData: { address_index: parseInt(msg) } };
  }

  // AI Parsing
  const prompt = `
    You are an intelligent ordering assistant for Royal Hotel.
    Analyze this message: "${state.inputText}"
    
    RULES:
    1. ORDER FOOD FLOW: 
       - If user wants to add food (e.g. "2 thali"), intent is "ADD_TO_CART".
       - If user wants to remove food (e.g. "remove 1 thali"), intent is "REMOVE_FROM_CART".
       - If they want the menu, "SHOW_MENU".
    2. TRACK/HISTORY FLOW: "TRACK_ORDER", "ORDER_STATS", "CANCEL_ORDER".
    3. ADDRESS FLOW: 
       - If they type an address, intent is "PROVIDE_ADDRESS".
       - If they type "1" or "first address", intent is "SELECT_SAVED_ADDRESS" and address_index is 1.
    4. HELP FLOW: "HELP".
  `;

  try {
    const aiDecision = await aiBrain.invoke(prompt);
    return { ...state, aiIntent: aiDecision.intent, aiData: aiDecision };
  } catch (error) {
    console.error("AI Error:", error);
    return { ...state, aiIntent: "UNKNOWN", aiData: {} };
  }
}

// ---------------- 3. THE HANDS NODE (Execution) ---------------- //
async function actionExecutionNode(state) {
  const { aiIntent, aiData, phone, inputText } = state;
  const user = await getOrCreateUser(phone);
  const session = await getOrCreateSession(phone);
  let replyText = "";
  let buttons = [];

  switch (aiIntent) {
    case "GREETING":
      const hasActiveOrder = await getActiveOrder(user._id);
      replyText = `👑 *Welcome to Royal Hotel*\n\nHow can we serve you today?`;
      buttons = [{ id: "btn_order", title: "🍔 Order Food" }];
      if (hasActiveOrder) buttons.push({ id: "btn_track", title: "📦 Track Order" });
      buttons.push({ id: "btn_help", title: "ℹ️ Help & Support" });
      break;

    case "TRACK_ORDER":
      const orderToTrack = await getActiveOrder(user._id);
      if (orderToTrack) {
        replyText = `📦 *Your Active Order*\n\n🔖 Order ID: ${orderToTrack.orderNumber}\n📊 Status: *${orderToTrack.status.toUpperCase()}*\n💰 Amount: ₹${orderToTrack.pricing?.total || 0}`;
        if (orderToTrack.deliveryBoy && orderToTrack.deliveryBoy.phone) {
          replyText += `\n\n🛵 *Delivery Executive:*\nName: ${orderToTrack.deliveryBoy.name || "Executive"}\n📞 Contact: ${orderToTrack.deliveryBoy.phone}`;
        } else if (["pending", "preparing"].includes(orderToTrack.status)) {
          replyText += `\n\n👨‍🍳 Your food is being prepared.`;
        }
        buttons = [{ id: "btn_order", title: "🍔 Order More Food" }];
        if (["pending", "preparing", "accepted"].includes(orderToTrack.status)) {
          buttons.push({ id: "btn_cancel_order", title: "❌ Cancel Order" });
        }
      } else {
        replyText = "You don't have any active orders right now.";
        buttons = [{ id: "btn_order", title: "🍔 Order Food" }];
      }
      break;

    case "CANCEL_ORDER":
      const cancelledOrder = await cancelOrder(user._id);
      if (cancelledOrder) {
        replyText = `✅ *Order Cancelled Successfully*\n\nYour order (ID: ${cancelledOrder.orderNumber}) has been cancelled.`;
      } else {
        replyText = `❌ *Cannot Cancel Order*\n\nYou either don't have an active order, or it cannot be cancelled now.`;
      }
      buttons = [{ id: "btn_order", title: "🍔 Order Food" }];
      break;

    case "ORDER_STATS":
      const stats = await getUserOrderStats(user._id);
      replyText = stats.totalOrders > 0 
        ? `📊 *Your Ordering Journey*\n\n🛍️ Total Orders: *${stats.totalOrders}*\n💵 Total Spent: *₹${stats.totalSpent.toFixed(2)}*`
        : "You haven't placed any orders yet.";
      buttons = [{ id: "btn_order", title: "🍔 Order Food" }];
      break;

    case "HELP":
      replyText = `🎧 *Royal Hotel Support*\n\n📞 +91 9876543210\n📧 support@royalhotel.com`;
      buttons = [{ id: "btn_order", title: "🍔 Order Food" }];
      break;

    case "SHOW_MENU":
      const categories = await getCategories();
      replyText = "🍽️ Please choose a category to see our menu:";
      buttons = (categories || []).map(c => ({ id: `cat_${c._id}`, title: c.name }));
      break;

    case "SHOW_CATEGORY_ITEMS":
      const items = await getMenuByCategory(aiData.categoryId);
      if (!items || items.length === 0) {
        replyText = "❌ No items in this category.";
      } else {
        const menuText = items.map((m, i) => `${i + 1}. ${m.name} - ₹${m.basePrice}`).join("\n");
        replyText = `📜 *Menu:*\n\n${menuText}\n\n*Type what you'd like to order (e.g. '2 ${items[0].name}')*`;
      }
      break;

    case "ADD_TO_CART":
      const itemsToAdd = aiData.extracted_items || [];
      if (itemsToAdd.length === 0) {
        replyText = "Please specify the item and quantity.";
      } else {
        const cart = await addItemsToCart(phone, itemsToAdd);
        let cartSummary = cart.map(item => `▪️ ${item.quantity}x ${item.name} - ₹${item.total}`).join("\n");
        let subtotal = cart.reduce((sum, item) => sum + item.total, 0);
        replyText = `✅ *Items Added!*\n\n🛒 *Your Cart:*\n${cartSummary}\n\n💰 *Total Amount: ₹${subtotal}*\n\nWhat would you like to do next?`;
        buttons = [{ id: "btn_add_more", title: "➕ Add More Items" }, { id: "btn_checkout", title: "➡️ Checkout" }];
      }
      break;

    case "REMOVE_FROM_CART":
      const itemsToRemove = aiData.extracted_items || [];
      if (itemsToRemove.length === 0) {
        replyText = "Please specify the item and quantity to remove.";
      } else {
        const cart = await removeItemsFromCart(phone, itemsToRemove);
        if (!cart || cart.length === 0) {
          replyText = `🗑️ Cart is now empty.`;
          buttons = [{ id: "btn_order", title: "🍔 Order Food" }];
        } else {
          let cartSummary = cart.map(item => `▪️ ${item.quantity}x ${item.name} - ₹${item.total}`).join("\n");
          let subtotal = cart.reduce((sum, item) => sum + item.total, 0);
          replyText = `🗑️ *Item Removed!*\n\n🛒 *Updated Cart:*\n${cartSummary}\n\n💰 *New Total: ₹${subtotal}*`;
          buttons = [{ id: "btn_add_more", title: "➕ Add More Items" }, { id: "btn_checkout", title: "➡️ Checkout" }];
        }
      }
      break;

    case "CHECKOUT":
      const addresses = await getUserAddresses(user._id);
      if (!addresses || addresses.length === 0) {
        replyText = "📍 *Where should we deliver your food?*\n\nPlease type your complete delivery address (Area and Landmark) below:";
        buttons = []; 
      } else {
        let addressText = "📍 *Where should we deliver your food?*\n\n";
        const topAddresses = addresses.slice(0, 2);
        topAddresses.forEach((addr, index) => {
          const streetStr = addr.street || "";
          const landmarkStr = addr.landmark ? `, ${addr.landmark}` : "";
          addressText += `*${index + 1}) ${addr.label || "Address"}*\n${streetStr}${landmarkStr}\n\n`;
        });
        addressText += "👉 *Click a button below or type '1' or '2' to choose.*";
        replyText = addressText;
        buttons = topAddresses.map((addr, index) => ({ id: `addr_${addr._id}`, title: `🏡 Deliver to ${index + 1}` }));
        buttons.push({ id: "btn_new_address", title: "➕ Add New Address" });
      }
      break;

    case "SELECT_SAVED_ADDRESS":
      const savedAddresses = await getUserAddresses(user._id);
      const index = (aiData.address_index || 1) - 1; 
      
      if (savedAddresses && savedAddresses[index]) {
         session.addressId = savedAddresses[index]._id;
         await session.save();
         replyText = `✅ Delivering to: ${savedAddresses[index].street}\n\n💳 Please choose a payment method:`;
         buttons = [{ id: "pay_cod", title: "💵 Cash on Delivery" }, { id: "pay_online", title: "💳 Pay Online (UPI)" }];
      } else {
         replyText = "❌ Invalid selection. Please type your full address below:";
      }
      break;

    case "PROVIDE_ADDRESS":
      const addrObj = aiData.address || { area: inputText, landmark: "" };
      const newAddr = await saveNewAddress(user._id, addrObj);
      session.addressId = newAddr._id;
      await session.save();
      replyText = `✅ Address saved: ${newAddr.street}, ${newAddr.landmark}\n\n💳 Please choose a payment method:`;
      buttons = [{ id: "pay_cod", title: "💵 Cash on Delivery" }, { id: "pay_online", title: "💳 Pay Online (UPI)" }];
      break;

    // 🔥 FIXED: Added missing CHOOSE_PAYMENT case
    case "CHOOSE_PAYMENT":
      if (aiData.addressId) {
        session.addressId = aiData.addressId;
        await session.save();
      }
      replyText = "💳 Please choose a payment method:";
      buttons = [{ id: "pay_cod", title: "💵 Cash on Delivery" }, { id: "pay_online", title: "💳 Pay Online (UPI)" }];
      break;

    // 🔥 FIXED: Added missing INITIATE_UPI_PAYMENT case
    case "INITIATE_UPI_PAYMENT":
      const cartItems = session.cart || [];
      if (cartItems.length === 0) {
        replyText = "🛒 Your cart is empty! Please add some items first.";
        buttons = [{ id: "btn_order", title: "🍔 Order Food" }];
        break;
      }
      const cartSub = cartItems.reduce((sum, item) => sum + item.total, 0);
      const finalAmount = cartSub + (cartSub * 0.05); // Calculating with 5% tax
      const upiLink = `upi://pay?pa=merchant@upi&pn=RoyalHotel&am=${finalAmount.toFixed(2)}&cu=INR`;
      
      replyText = `💳 *Online Payment*\nGrand Total (incl. Taxes): *₹${finalAmount.toFixed(2)}*\n\n👉 Click the link to pay:\n🔗 ${upiLink}\n\nOnce paid, click confirm below.`;
      buttons = [{ id: "btn_paid", title: "✅ I have Paid" }];
      break;

    case "COMPLETE_ORDER":
      try {
        const methodUsed = aiData.method || "COD";
        
        console.log("--- ATTEMPTING TO PLACE ORDER ---");
        console.log("Phone:", phone);
        console.log("Payment Method:", methodUsed);
        console.log("Session Address ID:", session.addressId);
        
        if (!session.cart || session.cart.length === 0) {
           throw new Error("Cart is empty! Cannot place order.");
        }
        if (!session.addressId) {
           throw new Error("Address ID is missing! Cannot place order.");
        }

        const order = await placeOrder(phone, methodUsed); 
        
        if (!order) {
          throw new Error("placeOrder function returned null or undefined.");
        }

        const formattedMethod = methodUsed === "ONLINE" ? "Paid Online ✅" : "Cash on Delivery 💵";
        replyText = `🎉 *Order Confirmed!*\n\n🔖 Order ID: *${order.orderNumber || "Processing"}*\n💳 Payment: *${formattedMethod}*\n\nOur chefs are preparing your delicious food! 👨‍🍳🔥`;
        buttons = [{ id: "btn_track", title: "📦 Track Order" }, { id: "btn_order", title: "🍔 Order Again" }];
        
      } catch (error) {
        console.error("❌ CRITICAL DB ERROR:", error.message);
        console.error("Full Error Stack:", error);
        
        replyText = `❌ Error placing order: ${error.message}. Please try checking out again.`;
        buttons = [{ id: "btn_checkout", title: "➡️ Retry Checkout" }];
      }
      break;

    default:
      replyText = "I didn't quite catch that. You can browse our menu, track your order, or ask for help.";
      buttons = [{ id: "btn_order", title: "🍔 Order Food" }, { id: "btn_help", title: "ℹ️ Help" }];
  }

  return { ...state, replyText, buttons };
}

/* ---------------- 4. BUILD GRAPH ---------------- */
function buildOrderGraph() {
  const graph = new StateGraph({
    channels: {
      phone: { value: (old, n) => n ?? old, default: () => "" },
      inputText: { value: (old, n) => n ?? old, default: () => "" },
      aiIntent: { value: (old, n) => n ?? old, default: () => "GREETING" },
      aiData: { value: (old, n) => n ?? old, default: () => ({}) },
      replyText: { value: (old, n) => n ?? old, default: () => "" },
      buttons: { value: (old, n) => n ?? old, default: () => [] }, 
    },
  });

  graph.addNode("brain", agentDecisionNode);
  graph.addNode("hands", actionExecutionNode);
  graph.setEntryPoint("brain");
  graph.addEdge("brain", "hands");
  graph.addEdge("hands", "__end__");

  return graph.compile();
}

module.exports = { buildOrderGraph };