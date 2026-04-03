require("dotenv").config(); // 🔥 FIX: Ensure environment variables are loaded
const { StateGraph } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");
const { z } = require("zod");

const {
  getOrCreateUser, getOrCreateSession, getActiveOrder,
  getCategories, getMenuByCategory, getUserAddresses,
  saveNewAddress, addItemsToCart, placeOrder, getUserOrderStats,
  cancelOrder, removeItemsFromCart, 
  processBotOrderAndPayment, checkLatestPaymentStatus
} = require("../tools/orderTools");

const userContextMemory = {}; 
const paymentAttemptsMemory = {}; 

// 🔥 FIX: Explicitly passing the API key to avoid missing credentials error
const llm = new ChatOpenAI({ 
  openAIApiKey: process.env.OPENAI_API_KEY, 
  modelName: "gpt-4o-mini", 
  temperature: 0 
});

const IntentSchema = z.object({
  intent: z.enum([
    "GREETING", "SHOW_MENU", "SHOW_CATEGORY_ITEMS", "ADD_TO_CART", "REMOVE_FROM_CART", 
    "CHECKOUT", "PROVIDE_ADDRESS", "SELECT_SAVED_ADDRESS", 
    "INITIATE_RAZORPAY_PAYMENT", "COMPLETE_ORDER", "TRACK_ORDER", "ORDER_STATS", "CANCEL_ORDER", "HELP", "UNKNOWN"
  ]).describe("Identify the core intent based on user input and the previous bot message context."),
  
  category_index: z.number().nullable(),
  category_name: z.string().nullable(),
  extracted_items: z.array(z.object({
    name: z.string(),
    quantity: z.number()
  })),
  
  address: z.object({
    area: z.string().describe("Extract the main street, area, or flat details (e.g. '007, 8th floor bansal one')"),
    landmark: z.string().describe("Extract the landmark if provided (e.g. 'db mall'). If not provided, return 'Not provided'.")
  }).nullable().describe("Extract area and landmark if the user provides a new physical address."),

  address_index: z.number().nullable()
});

const aiBrain = llm.withStructuredOutput(IntentSchema, { strict: true });

async function agentDecisionNode(state) {
  const msg = (state.inputText || "").trim().toLowerCase();
  const phone = state.phone;
  
  const previousBotMessage = userContextMemory[phone] || "None";
  console.log(`🧐 Memory Context for ${phone}:`, previousBotMessage.substring(0, 60).replace(/\n/g, ' ') + "...");

  if (previousBotMessage.includes("Welcome to Royal Hotel") || previousBotMessage.includes("How may I humbly serve you")) {
    if (msg === "1" || msg.includes("menu")) return { ...state, aiIntent: "SHOW_MENU", aiData: {} };
    if (msg === "2" || msg.includes("track")) return { ...state, aiIntent: "TRACK_ORDER", aiData: {} };
    if (msg === "3" || msg.includes("help")) return { ...state, aiIntent: "HELP", aiData: {} };
  }

  if (previousBotMessage.includes("Our Menu Categories")) {
    const num = parseInt(msg);
    if (!isNaN(num) && msg.length <= 2) return { ...state, aiIntent: "SHOW_CATEGORY_ITEMS", aiData: { category_index: num, intent: "SHOW_CATEGORY_ITEMS" } };
  }

  if (previousBotMessage.includes("What is your next command?") || previousBotMessage.includes("Your Updated Cart")) {
    if (msg === "1" || msg.includes("add")) return { ...state, aiIntent: "SHOW_MENU", aiData: {} };
    if (msg === "2" || msg.includes("checkout")) return { ...state, aiIntent: "CHECKOUT", aiData: {} };
  }

  if (previousBotMessage.includes("Where shall we dispatch")) {
    const num = parseInt(msg);
    if (!isNaN(num) && msg.length <= 1) return { ...state, aiIntent: "SELECT_SAVED_ADDRESS", aiData: { address_index: num, intent: "SELECT_SAVED_ADDRESS" } };
  }

  if (["hi", "hello", "start", "home"].includes(msg)) return { ...state, aiIntent: "GREETING", aiData: {} };
  if (["checkout", "pay", "done", "paid"].includes(msg)) return { ...state, aiIntent: "COMPLETE_ORDER", aiData: {} }; 

  const prompt = `
    You are an intelligent order routing AI for the "Royal Hotel". 
    Read the 'BOT_LAST_MESSAGE' and the 'USER_REPLY'. Compare them to understand what the user wants to do.

    === CONTEXT ===
    BOT_LAST_MESSAGE: """${previousBotMessage}"""
    USER_REPLY: """${state.inputText}"""
    
    === DECISION RULES & MAPPING (CRITICAL) ===
    1. ADD/REMOVE ITEMS: If user types food names -> intent "ADD_TO_CART". If "remove" -> intent "REMOVE_FROM_CART".
    2. NEW ADDRESS: If BOT_LAST_MESSAGE asks for a new address and USER_REPLY contains text like "Area: xyz" or "Landmark: abc" OR any long physical address string -> Intent is "PROVIDE_ADDRESS". Extract the 'area' and 'landmark'.
    3. COMPLETE ORDER: If BOT_LAST_MESSAGE gave a Razorpay payment link and asked to reply "Paid" -> USER_REPLY "paid", "done", "yes" = "COMPLETE_ORDER".
  `;

  try {
    const aiDecision = await aiBrain.invoke(prompt);
    return { ...state, aiIntent: aiDecision.intent, aiData: aiDecision };
  } catch (error) {
    console.error("AI Error:", error);
    return { ...state, aiIntent: "UNKNOWN", aiData: {} };
  }
}

async function actionExecutionNode(state) {
  const { aiIntent, aiData, phone, inputText } = state;
  const user = await getOrCreateUser(phone);
  const session = await getOrCreateSession(phone); 
  let replyText = "";

  switch (aiIntent) {
    case "GREETING": {
      const hasActiveOrder = await getActiveOrder(user._id);
      replyText = `👑 *Welcome to Royal Hotel*\n\nHow may I humbly serve you today, esteemed guest?\n\nReply with a number:\n*1.* 🍔 Order a Feast (Menu)`;
      if (hasActiveOrder) replyText += `\n*2.* 📦 Track Your Royal Order`;
      replyText += `\n*3.* ℹ️ Seek My Assistance (Help)`;
      break;
    }

    case "TRACK_ORDER": {
      const orderToTrack = await getActiveOrder(user._id);
      if (orderToTrack) {
        replyText = `📦 *Your Active Order*\n\n🔖 Order ID: ${orderToTrack.orderNumber || orderToTrack._id}\n📊 Status: *${orderToTrack.status ? orderToTrack.status.toUpperCase() : "PROCESSING"}*\n💰 Amount: ₹${orderToTrack.totalAmount || orderToTrack.pricing?.total || 0}`;
        if (orderToTrack.deliveryBoy && orderToTrack.deliveryBoy.phone) {
          replyText += `\n\n🛵 *Your Chariot Arrives:*\nRider: ${orderToTrack.deliveryBoy.name || "Executive"}\n📞 Contact: ${orderToTrack.deliveryBoy.phone}`;
        } else {
          replyText += `\n\n👨‍🍳 Our royal chefs are presently crafting your meal.`;
        }
        replyText += `\n\nReply with:\n*1.* 🍔 Order More Delights\n*2.* ❌ Cancel Order`;
      } else {
        replyText = "Forgive me, my lord, but I do not see any active orders for you at this moment.\n\nReply *1* to browse the royal menu.";
      }
      break;
    }

    case "CANCEL_ORDER": {
      const cancelledOrder = await cancelOrder(user._id);
      if (cancelledOrder) {
        replyText = `✅ *Order Cancelled Successfully*\n\nAs you command, your order has been halted.\n\nReply *1* whenever you wish to order again.`;
      } else {
        replyText = `❌ *Cannot Cancel Order*\n\nI humbly apologize, but you either have no active order, or it has progressed too far to be cancelled now.\n\nReply *1* to browse the menu.`;
      }
      break;
    }

    case "ORDER_STATS": {
      replyText = "Order stats feature is coming soon! Reply *1* to explore our feasts.";
      break;
    }

    case "HELP": {
      replyText = `🎧 *Royal Hotel Servants at Your Beck & Call*\n\n📞 +91 9876543210\n📧 servants@royalhotel.com\n\nReply *1* to behold the menu.`;
      break;
    }

    case "SHOW_MENU": {
      const categoriesList = await getCategories();
      replyText = "🍽️ *Our Menu Categories:*\nI beg you, simply reply with the number of your desired category:\n\n";
      (categoriesList || []).forEach((c, index) => {
        replyText += `*${index + 1}.* ${c.name}\n`;
      });
      break;
    }

    case "SHOW_CATEGORY_ITEMS": {
      const categories = await getCategories();
      let selectedCat = null;
      
      const catIndex = aiData?.category_index;
      const catName = aiData?.category_name;

      if (catIndex && categories[catIndex - 1]) selectedCat = categories[catIndex - 1];
      else if (catName) selectedCat = categories.find(c => c.name.toLowerCase().includes(catName.toLowerCase()));

      if (!selectedCat) {
        replyText = "My deepest apologies, esteemed guest, but I could not find that category in our scrolls. Pray, type 'Menu' to view the options once more.";
        break;
      }

      const items = await getMenuByCategory(selectedCat._id);
      if (!items || items.length === 0) {
        replyText = `I am terribly sorry, my lord, but the pantry is currently bare of items in ${selectedCat.name}.\n\nReply 'Menu' to gaze upon other offerings.`;
      } else {
        const menuText = items.map((m, i) => `▪️ ${m.name} - ₹${m.basePrice}`).join("\n");
        replyText = `📜 *The Royal Selection: ${selectedCat.name}*\n\n${menuText}\n\n👉 *Please type what you desire (e.g., '2 ${items[0]?.name || "items"}')*`;
      }
      break;
    }

    case "ADD_TO_CART": {
      const itemsToAdd = aiData?.extracted_items || [];
      if (itemsToAdd.length === 0) {
        replyText = "Forgive my simple mind, my lord, but could you please specify the exact item and quantity? (e.g., '1 Pizza').";
      } else {
        const cart = await addItemsToCart(phone, itemsToAdd);
        let cartSummary = cart.map(item => `▪️ ${item.quantity}x ${item.name} - ₹${item.total}`).join("\n");
        let subtotal = cart.reduce((sum, item) => sum + item.total, 0);
        replyText = `✅ *Splendid! Added to your royal cart.*\n\n🛒 *Your Banquet So Far:*\n${cartSummary}\n💰 *Current Total: ₹${subtotal}*\n\nWhat is your next command? Reply with:\n*1.* ➕ Add More Delights\n*2.* ➡️ Proceed to Checkout`;
      }
      break;
    }

    case "REMOVE_FROM_CART": {
      const itemsToRemove = aiData?.extracted_items || [];
      if (itemsToRemove.length === 0) {
        replyText = "My apologies, my lord, please tell me the exact item and quantity you wish me to remove.";
      } else {
        const cart = await removeItemsFromCart(phone, itemsToRemove);
        if (!cart || cart.length === 0) {
          replyText = `🗑️ As you wish, your cart has been completely emptied.\n\nReply *1* whenever you wish to browse the menu again.`;
        } else {
          let cartSummary = cart.map(item => `▪️ ${item.quantity}x ${item.name} - ₹${item.total}`).join("\n");
          let subtotal = cart.reduce((sum, item) => sum + item.total, 0);
          replyText = `🗑️ *Item Removed as Commanded!*\n\n🛒 *Your Updated Cart:*\n${cartSummary}\n💰 *New Total: ₹${subtotal}*\n\nWhat is your next command? Reply with:\n*1.* ➕ Add More Items\n*2.* ➡️ Proceed to Checkout`;
        }
      }
      break;
    }

    case "CHECKOUT": {
      const addresses = await getUserAddresses(user._id);
      
      let addressPrompt = "📍 *Where shall we dispatch your royal feast?*\n\n";
      
      if (addresses && addresses.length > 0) {
        addressPrompt += "Reply with a number to choose a saved address:\n";
        const topAddresses = addresses.slice(0, 2);
        topAddresses.forEach((addr, index) => {
          const streetStr = addr.street || "";
          const landmarkStr = addr.landmark ? `, ${addr.landmark}` : "";
          addressPrompt += `*${index + 1}.* ${addr.label || "Home"} - ${streetStr}${landmarkStr}\n`;
        });
        addressPrompt += "\n👉 *OR Provide a NEW address by typing in this exact format:*\n";
      } else {
        addressPrompt += "👉 *Please provide your delivery address in this exact format:*\n\n";
      }

      addressPrompt += `Area: 007, 8th floor bansal one\nLandmark: db mall`;
      
      replyText = addressPrompt;
      break;
    }

    case "SELECT_SAVED_ADDRESS": {
      const savedAddresses = await getUserAddresses(user._id);
      const index = (aiData?.address_index || 1) - 1; 
      
      if (savedAddresses && savedAddresses[index]) {
         const addressId = savedAddresses[index]._id;
         session.addressId = addressId;
         await session.save();
         
         const cartItems = session.cart || [];
         if(cartItems.length === 0) {
            replyText = "Your cart is empty. Please type 'Menu' to add items first.";
            break;
         }

         const paymentData = await processBotOrderAndPayment(user._id, phone, cartItems, addressId);

         if (paymentData.success) {
           paymentAttemptsMemory[phone] = 0; 
           replyText = `✅ Address confirmed: ${savedAddresses[index].street}\n\n💳 *Online Royal Treasury*\nGrand Total: *₹${paymentData.totalAmount.toFixed(2)}*\n\n👉 Please pay securely via Razorpay:\n🔗 ${paymentData.paymentUrl}\n\n*Aapka order auto-confirm ho jayega payment successful hote hi!*`;
           session.cart = []; 
           await session.save();
         } else {
           replyText = "Apologies, there was an issue generating your payment link. Please try again.";
         }
      } else {
         replyText = "Forgive me, but I do not recognize that choice. Please provide a new address in the Area/Landmark format.";
      }
      break;
    }

    case "PROVIDE_ADDRESS": {
      const extractedAddress = aiData?.address || { area: inputText, landmark: "Not provided" };
      
      const newAddr = await saveNewAddress(user._id, extractedAddress);
      session.addressId = newAddr._id;
      await session.save();

      const cartItems = session.cart || [];
      if(cartItems.length === 0) {
         replyText = "Your cart is empty. Please type 'Menu' to add items first.";
         break;
      }

      const paymentData = await processBotOrderAndPayment(user._id, phone, cartItems, newAddr._id);

      if (paymentData.success) {
        paymentAttemptsMemory[phone] = 0; 
        const displayLandmark = newAddr.landmark ? `, near ${newAddr.landmark}` : "";
        replyText = `✅ New address saved: ${newAddr.street}${displayLandmark}\n\n💳 *Online Royal Treasury*\nGrand Total: *₹${paymentData.totalAmount.toFixed(2)}*\n\n👉 Please pay securely via Razorpay:\n🔗 ${paymentData.paymentUrl}\n\n*Aapka order auto-confirm ho jayega payment successful hote hi!*`;
        session.cart = []; 
        await session.save();
      } else {
        replyText = "Apologies, there was an issue generating your payment link. Please try again.";
      }
      break;
    }

    case "COMPLETE_ORDER": {
      const paymentCheck = await checkLatestPaymentStatus(user._id);

      if (!paymentCheck.found) {
        replyText = "I couldn't find any pending orders for you. Please type 'Menu' to start a new order.";
        break;
      }

      if (paymentCheck.isPaid) {
        paymentAttemptsMemory[phone] = 0; 
        replyText = `🎉 *Your Payment is Confirmed & Feast Decreed!*\n\nOrder ID: *${paymentCheck.orderNumber}*\nPayment Method: *RAZORPAY ONLINE*\n\nOur grand chefs are already preparing your delicacies! 👨‍🍳🔥\n\nType *Track* whenever you wish to see your order's journey.`;
      } else {
        let attempts = (paymentAttemptsMemory[phone] || 0) + 1;
        paymentAttemptsMemory[phone] = attempts; 

        if (attempts >= 3) {
          await cancelOrder(user._id);
          paymentAttemptsMemory[phone] = 0; 
          replyText = `❌ *Order Cancelled*\n\nWe haven't received your payment after 3 attempts. Your order has been automatically cancelled for security reasons.\n\nReply *1* to browse the menu and order again.`;
        } else {
          replyText = `⚠️ *Payment Not Received Yet*\n\nI just checked the royal treasury, but your payment hasn't reflected yet. *(Attempt ${attempts}/3)*\n\nPlease ensure you have paid using the Razorpay link provided.`;
        }
      }
      break;
    }

    default: {
      replyText = "My deepest apologies, esteemed guest, but this humble servant did not quite catch your meaning. You may type 'Menu' to browse our royal feasts, 'Track' to see your order's journey, or 'Help' if you require my assistance.";
    }
  }

  userContextMemory[phone] = replyText;
  return { ...state, replyText }; 
}

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