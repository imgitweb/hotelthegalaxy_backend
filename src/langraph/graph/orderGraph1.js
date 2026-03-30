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
    "SHOW_MENU", "SHOW_CATEGORY_ITEMS", "ADD_TO_CART", "REMOVE_FROM_CART", 
    "CHECKOUT", "PROVIDE_ADDRESS", "SELECT_SAVED_ADDRESS", 
    "CHOOSE_PAYMENT", "INITIATE_UPI_PAYMENT", "COMPLETE_ORDER",
    "TRACK_ORDER", "ORDER_STATS", "CANCEL_ORDER", 
    "HELP", "UNKNOWN"
  ]).describe("Identify the core intent based on user input and the previous bot message context."),
  
  category_index: z.number().nullable().describe("If the user replies with a number to select a menu category, extract it here."),
  category_name: z.string().nullable().describe("If the user types a category name (fix any typos), extract it here."),

  extracted_items: z.array(z.object({
    name: z.string().describe("Food item name (auto-correct typos)"),
    quantity: z.number().describe("Quantity")
  })).describe("Extract ALL food items and quantities for adding/removing. Return [] if none."),
  
  address: z.object({
    area: z.string(),
    landmark: z.string()
  }).nullable().describe("Extract area and landmark if the user types a new address manually."),

  address_index: z.number().nullable().describe("If the bot asked to choose an address and user types a number (e.g., 1 or 2), extract here."),
  
  payment_method: z.enum(["COD", "ONLINE"]).nullable().describe("If the bot asked for payment and user typed 1/COD or 2/Online/UPI.")
});

const aiBrain = llm.withStructuredOutput(IntentSchema, { strict: true });

// ---------------- 2. THE BRAIN NODE ---------------- //
async function agentDecisionNode(state) {
  const msg = (state.inputText || "").trim().toLowerCase();
  
  // 🔥 Fast text routing for exact matches (Saves AI processing time)
  if (["hi", "hello", "start", "home"].includes(msg)) return { ...state, aiIntent: "GREETING" };
  if (["menu", "order", "order food", "show menu"].includes(msg)) return { ...state, aiIntent: "SHOW_MENU" };
  if (["checkout", "pay", "done"].includes(msg)) return { ...state, aiIntent: "CHECKOUT" };
  if (["track", "track order"].includes(msg)) return { ...state, aiIntent: "TRACK_ORDER" };
  if (["help", "support"].includes(msg)) return { ...state, aiIntent: "HELP" };
  
  // Context setup
  const previousContext = state.replyText ? state.replyText : "No previous conversation.";

  // 🔥 AI Contextual Parsing
  const prompt = `
    You are an intelligent, highly polite royal servant assisting guests with ordering food at the Royal Hotel.
    Users interact with you purely via text. They will type numbers (1, 2) to select options or type text naturally (often with typos).
    
    PREVIOUS BOT MESSAGE (Context):
    """${previousContext}"""
    
    USER'S REPLY: 
    "${state.inputText}"
    
    RULES & CONTEXTUAL LOGIC:
    1. TYPOS: If user types "stater" -> "Starters". "1 piza" -> "1 Pizza". Handle misspellings gracefully.
    2. NUMBERS BASED ON CONTEXT:
       - CRITICAL: If Previous Message contains "Our Menu Categories" and user replies with a number (e.g. "1", "2", "3"), intent MUST be SHOW_CATEGORY_ITEMS and you MUST set category_index to that exact number.
       - If Previous Message contains "Welcome to Royal Hotel" and user replies "1", intent is SHOW_MENU. If "2", intent is TRACK_ORDER.
       - If Previous Message contains "Where should we deliver" and user replies "1" or "2", intent is SELECT_SAVED_ADDRESS with address_index.
       - If Previous Message contains "choose a payment method" and user replies "1", intent is COMPLETE_ORDER with payment_method COD. If "2", intent is INITIATE_UPI_PAYMENT with payment_method ONLINE.
    3. ADD/REMOVE: If user types "2 thali", "1 biryani", or "add 1 roti", intent is ADD_TO_CART. If "remove 1 thali", intent is REMOVE_FROM_CART.
    4. NEW ADDRESS: If user types a full address (e.g., "M G Road, near mall"), intent is PROVIDE_ADDRESS.
  `;

  try {
    const aiDecision = await aiBrain.invoke(prompt);
    
    // Intercept for payment choices
    if (aiDecision.payment_method === "COD") {
      aiDecision.intent = "COMPLETE_ORDER";
    } else if (aiDecision.payment_method === "ONLINE") {
      aiDecision.intent = "INITIATE_UPI_PAYMENT";
    }

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

  switch (aiIntent) {
    case "GREETING":
      const hasActiveOrder = await getActiveOrder(user._id);
      replyText = `👑 *Welcome to Royal Hotel*\n\nHow may I humbly serve you today, esteemed guest?\n\nReply with a number:\n*1.* 🍔 Order a Feast (Menu)`;
      if (hasActiveOrder) replyText += `\n*2.* 📦 Track Your Royal Order`;
      replyText += `\n*3.* ℹ️ Seek My Assistance (Help)`;
      break;

    case "TRACK_ORDER":
      const orderToTrack = await getActiveOrder(user._id);
      if (orderToTrack) {
        replyText = `📦 *Your Active Order*\n\n🔖 Order ID: ${orderToTrack.orderNumber}\n📊 Status: *${orderToTrack.status.toUpperCase()}*\n💰 Amount: ₹${orderToTrack.pricing?.total || 0}`;
        if (orderToTrack.deliveryBoy && orderToTrack.deliveryBoy.phone) {
          replyText += `\n\n🛵 *Your Chariot Arrives:*\nRider: ${orderToTrack.deliveryBoy.name || "Executive"}\n📞 Contact: ${orderToTrack.deliveryBoy.phone}`;
        } else if (["pending", "preparing"].includes(orderToTrack.status)) {
          replyText += `\n\n👨‍🍳 Our royal chefs are presently crafting your meal.`;
        }
        replyText += `\n\nReply with:\n*1.* 🍔 Order More Delights`;
        if (["pending", "preparing", "accepted"].includes(orderToTrack.status)) {
          replyText += `\n*2.* ❌ Cancel Order`;
        }
      } else {
        replyText = "Forgive me, my lord, but I do not see any active orders for you at this moment.\n\nReply *1* to browse the royal menu.";
      }
      break;

    case "CANCEL_ORDER":
      const cancelledOrder = await cancelOrder(user._id);
      if (cancelledOrder) {
        replyText = `✅ *Order Cancelled Successfully*\n\nAs you command, your order (ID: ${cancelledOrder.orderNumber}) has been halted.\n\nReply *1* whenever you wish to order again.`;
      } else {
        replyText = `❌ *Cannot Cancel Order*\n\nI humbly apologize, but you either have no active order, or it has progressed too far to be cancelled now.\n\nReply *1* to browse the menu.`;
      }
      break;

    case "ORDER_STATS":
      const stats = await getUserOrderStats(user._id);
      replyText = stats.totalOrders > 0 
        ? `📊 *Your Royal History*\n\n🛍️ Feasts Enjoyed: *${stats.totalOrders}*\n💵 Treasure Spent: *₹${stats.totalSpent.toFixed(2)}*\n\nReply *1* to Order More.`
        : "You have not yet graced us with an order, my lord.\n\nReply *1* to explore our feasts.";
      break;

    case "HELP":
      replyText = `🎧 *Royal Hotel Servants at Your Beck & Call*\n\n📞 +91 9876543210\n📧 servants@royalhotel.com\n\nReply *1* to behold the menu.`;
      break;

    case "SHOW_MENU":
      const categoriesList = await getCategories();
      replyText = "🍽️ *Our Menu Categories:*\nI beg you, simply reply with the number of your desired category:\n\n";
      (categoriesList || []).forEach((c, index) => {
        replyText += `*${index + 1}.* ${c.name}\n`;
      });
      break;

    case "SHOW_CATEGORY_ITEMS":
      const categories = await getCategories();
      let selectedCat = null;
      
      // Match by index (User typed 1, 2, etc.) or fuzzy match by name
      if (aiData.category_index && categories[aiData.category_index - 1]) {
        selectedCat = categories[aiData.category_index - 1];
      } else if (aiData.category_name) {
        selectedCat = categories.find(c => c.name.toLowerCase().includes(aiData.category_name.toLowerCase()));
      }

      if (!selectedCat) {
        replyText = "My deepest apologies, esteemed guest, but I could not find that category in our scrolls. Pray, type 'Menu' to view the options once more.";
        break;
      }

      const items = await getMenuByCategory(selectedCat._id);
      if (!items || items.length === 0) {
        replyText = `I am terribly sorry, my lord, but the pantry is currently bare of items in ${selectedCat.name}.\n\nReply 'Menu' to gaze upon other offerings.`;
      } else {
        const menuText = items.map((m, i) => `▪️ ${m.name} - ₹${m.basePrice}`).join("\n");
        replyText = `📜 *The Royal Selection: ${selectedCat.name}*\n\n${menuText}\n\n👉 *Please type what you desire (e.g., '2 ${items[0].name}')*`;
      }
      break;

    case "ADD_TO_CART":
      const itemsToAdd = aiData.extracted_items || [];
      if (itemsToAdd.length === 0) {
        replyText = "Forgive my simple mind, my lord, but could you please specify the exact item and quantity? (e.g., '1 Pizza').";
      } else {
        const cart = await addItemsToCart(phone, itemsToAdd);
        let cartSummary = cart.map(item => `▪️ ${item.quantity}x ${item.name} - ₹${item.total}`).join("\n");
        let subtotal = cart.reduce((sum, item) => sum + item.total, 0);
        replyText = `✅ *Splendid! Added to your royal cart.*\n\n🛒 *Your Banquet So Far:*\n${cartSummary}\n💰 *Current Total: ₹${subtotal}*\n\nWhat is your next command? Reply with:\n*1.* ➕ Add More Delights (or just type the item name)\n*2.* ➡️ Proceed to Checkout`;
      }
      break;

    case "REMOVE_FROM_CART":
      const itemsToRemove = aiData.extracted_items || [];
      if (itemsToRemove.length === 0) {
        replyText = "My apologies, my lord, please tell me the exact item and quantity you wish me to remove.";
      } else {
        const cart = await removeItemsFromCart(phone, itemsToRemove);
        if (!cart || cart.length === 0) {
          replyText = `🗑️ As you wish, your cart has been completely emptied.\n\nReply *1* whenever you wish to browse the menu again.`;
        } else {
          let cartSummary = cart.map(item => `▪️ ${item.quantity}x ${item.name} - ₹${item.total}`).join("\n");
          let subtotal = cart.reduce((sum, item) => sum + item.total, 0);
          replyText = `🗑️ *Item Removed as Commanded!*\n\n🛒 *Your Updated Cart:*\n${cartSummary}\n💰 *New Total: ₹${subtotal}*\n\nReply with:\n*1.* ➕ Add More Items\n*2.* ➡️ Proceed to Checkout`;
        }
      }
      break;

    case "CHECKOUT":
      const addresses = await getUserAddresses(user._id);
      if (!addresses || addresses.length === 0) {
        replyText = "📍 *Where shall we dispatch your royal feast?*\n\nI beseech you, type your complete delivery address (Area and Landmark) below:";
      } else {
        let addressText = "📍 *Where shall we dispatch your royal feast?*\n\n";
        const topAddresses = addresses.slice(0, 2);
        topAddresses.forEach((addr, index) => {
          const streetStr = addr.street || "";
          const landmarkStr = addr.landmark ? `, ${addr.landmark}` : "";
          addressText += `*${index + 1}.* ${addr.label || "Palace"} - ${streetStr}${landmarkStr}\n`;
        });
        addressText += `\n👉 *Reply with the number (1 or 2) to command your choice, OR simply type a completely new address below.*`;
        replyText = addressText;
      }
      break;

    case "SELECT_SAVED_ADDRESS":
      const savedAddresses = await getUserAddresses(user._id);
      const index = (aiData.address_index || 1) - 1; 
      
      if (savedAddresses && savedAddresses[index]) {
         session.addressId = savedAddresses[index]._id;
         await session.save();
         replyText = `✅ It shall be sent to: ${savedAddresses[index].street}\n\n💳 *How would you prefer to settle the royal treasury? (Reply with a number)*\n*1.* 💵 Pay upon Arrival (COD)\n*2.* 💳 Settle Online Now (UPI)`;
      } else {
         replyText = "Forgive me, but I do not recognize that choice. Please type your full delivery address below instead:";
      }
      break;

    case "PROVIDE_ADDRESS":
      const addrObj = aiData.address || { area: inputText, landmark: "" };
      const newAddr = await saveNewAddress(user._id, addrObj);
      session.addressId = newAddr._id;
      await session.save();
      replyText = `✅ Excellent, I have noted the address: ${newAddr.street}, ${newAddr.landmark}\n\n💳 *How would you prefer to settle the royal treasury? (Reply with a number)*\n*1.* 💵 Pay upon Arrival (COD)\n*2.* 💳 Settle Online Now (UPI)`;
      break;

    case "CHOOSE_PAYMENT":
      replyText = "💳 *How would you prefer to settle the royal treasury? (Reply with a number)*\n*1.* 💵 Pay upon Arrival (COD)\n*2.* 💳 Settle Online Now (UPI)";
      break;

    case "INITIATE_UPI_PAYMENT":
      const cartSub = session.cart.reduce((sum, item) => sum + item.total, 0);
      const finalAmount = cartSub + (cartSub * 0.05);
      const upiLink = `upi://pay?pa=merchant@upi&pn=RoyalHotel&am=${finalAmount.toFixed(2)}&cu=INR`;
      replyText = `💳 *Online Royal Treasury*\nGrand Total (incl. Taxes): *₹${finalAmount.toFixed(2)}*\n\n👉 Be so kind as to click the link below to pay:\n🔗 ${upiLink}\n\n*Once settled, please reply with "Paid" to confirm your glorious feast.*`;
      break;

    case "COMPLETE_ORDER":
      const paymentMethodUsed = aiData.payment_method || "COD";
      const order = await placeOrder(phone, paymentMethodUsed);
      replyText = `🎉 *Your Royal Feast is Decreed!*\n\nOrder ID: *${order?.orderNumber || "Processing"}*\nPayment Method: *${paymentMethodUsed}*\n\nOur grand chefs are already preparing your delicacies! 👨‍🍳🔥\n\nType *Track* whenever you wish to see your order's journey.`;
      break;

    default:
      replyText = "My deepest apologies, esteemed guest, but this humble servant did not quite catch your meaning. You may type 'Menu' to browse our royal feasts, 'Track' to see your order's journey, or 'Help' if you require my assistance.";
  }

  return { ...state, replyText }; 
}

/* ---------------- 4. BUILD GRAPH ---------------- */
function buildOrderGraph() {
  const graph = new StateGraph({
    channels: {
      phone: { value: (old, n) => n ?? old, default: () => "" },
      inputText: { value: (old, n) => n ?? old, default: () => "" },
      aiIntent: { value: (old, n) => n ?? old, default: () => "GREETING" },
      aiData: { value: (old, n) => n ?? old, default: () => ({}) },
      replyText: { value: (old, n) => n ?? old, default: () => "" }
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