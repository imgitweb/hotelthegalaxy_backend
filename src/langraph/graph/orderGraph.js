require("dotenv").config();
const { StateGraph } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");
const { z } = require("zod");

const {
  checkUserExists, registerNewUser, getOrCreateSession, getActiveOrder,
  getTodayRosterItems, getUserAddresses, getUserOrderStats,
  saveNewAddress, addItemsToCart, placeOrder, cancelOrder, removeItemsFromCart, 
  processBotOrderAndPayment, checkLatestPaymentStatus
} = require("../tools/orderTools");

const userContextMemory = {}; 
const paymentAttemptsMemory = {}; 

const llm = new ChatOpenAI({ 
  openAIApiKey: process.env.OPENAI_API_KEY, 
  modelName: "gpt-4o-mini", 
  temperature: 0 
});

const IntentSchema = z.object({
  intent: z.enum([
    "GREETING", "SHOW_MENU", "ADD_TO_CART", "REMOVE_FROM_CART", 
    "CHECKOUT", "PROVIDE_ADDRESS", "SELECT_SAVED_ADDRESS", "PROVIDE_NAME", 
    "INITIATE_RAZORPAY_PAYMENT", "COMPLETE_ORDER", "TRACK_ORDER", "ORDER_STATS", 
    "CANCEL_ORDER", "HELP", "GENERAL_INFO", "UNKNOWN" 
  ]).describe("Identify the core intent based on user input and the previous bot message context."),
  
  user_name: z.string().nullable().describe("Extract the user's name if they are providing it."),
  
  extracted_items: z.array(z.object({
    name: z.string(),
    quantity: z.number()
  })).nullable().describe("Extract food items and quantities. If none, return empty array."),
  
  address: z.object({
    area: z.string().describe("Extract the main street, area, or flat details"),
    landmark: z.string().describe("Extract the landmark if provided")
  }).nullable(),

  address_index: z.number().nullable()
});

const aiBrain = llm.withStructuredOutput(IntentSchema, { strict: true });

async function agentDecisionNode(state) {
  const msg = (state.inputText || "").trim().toLowerCase();
  const phone = state.phone;
  
  const previousBotMessage = userContextMemory[phone] || "None";
  console.log(`🧐 Memory Context for ${phone}:`, previousBotMessage.substring(0, 60).replace(/\n/g, ' ') + "...");

  if (msg.includes("address") || msg.includes("location") || msg.includes("phone") || msg.includes("contact") || msg.includes("where")) {
    return { ...state, aiIntent: "GENERAL_INFO", aiData: {} };
  }

  if (previousBotMessage.includes("Welcome to The Galaxy Hotel") || previousBotMessage.includes("How may I humbly serve you")) {
    if (msg === "1" || msg.includes("menu")) return { ...state, aiIntent: "SHOW_MENU", aiData: {} };
    if (msg === "2" || msg.includes("track")) return { ...state, aiIntent: "TRACK_ORDER", aiData: {} };
    if (msg === "3" || msg.includes("help")) return { ...state, aiIntent: "HELP", aiData: {} };
  }

  if (msg.includes("stats") || msg.includes("history") || msg.includes("kitne ka order") || msg.includes("purane order")) {
    return { ...state, aiIntent: "ORDER_STATS", aiData: {} };
  }

  if (previousBotMessage.includes("What is your next command?") || previousBotMessage.includes("Your Updated Cart")) {
    if (msg === "1" || msg.includes("add") || msg.includes("menu")) return { ...state, aiIntent: "SHOW_MENU", aiData: {} };
    if (msg === "2" || msg.includes("checkout")) return { ...state, aiIntent: "CHECKOUT", aiData: {} };
  }

  // 🔥 FAST ROUTING for Address Selection (Checks if user entered 1, 2, or 3)
  if (previousBotMessage.includes("Where shall we dispatch")) {
    const num = parseInt(msg);
    if (!isNaN(num) && msg.length <= 1) return { ...state, aiIntent: "SELECT_SAVED_ADDRESS", aiData: { address_index: num, intent: "SELECT_SAVED_ADDRESS" } };
  }

  if (["hi", "hello", "start", "home"].includes(msg)) return { ...state, aiIntent: "GREETING", aiData: {} };
  if (["checkout", "pay", "done", "paid"].includes(msg)) return { ...state, aiIntent: "COMPLETE_ORDER", aiData: {} }; 

  // 🔥 UPDATED PROMPT: Added logic so AI correctly handles new address input
  const prompt = `
    You are an intelligent order routing AI for "The Galaxy Hotel". 
    Read the 'BOT_LAST_MESSAGE' and the 'USER_REPLY'. Compare them to understand what the user wants to do.

    === CONTEXT ===
    BOT_LAST_MESSAGE: """${previousBotMessage}"""
    USER_REPLY: """${state.inputText}"""
    
    === DECISION RULES & MAPPING (CRITICAL) ===
    1. ADD/REMOVE ITEMS: If user types food names -> intent "ADD_TO_CART". If "remove" -> intent "REMOVE_FROM_CART".
    2. NEW ADDRESS: If BOT_LAST_MESSAGE asks for a new address (like "Add a NEW Address", "Where shall we dispatch", or "Please provide your delivery address") AND the user provides text (not a single digit), -> Intent is "PROVIDE_ADDRESS". Extract the 'area' and 'landmark'.
    3. COMPLETE ORDER: If BOT_LAST_MESSAGE gave a Razorpay payment link and asked to reply "Paid" -> USER_REPLY "paid", "done", "yes" = "COMPLETE_ORDER".
    4. ONBOARDING: If BOT_LAST_MESSAGE asks for the user's name -> intent "PROVIDE_NAME".
    5. ORDER STATS: If user asks about their "history" -> intent "ORDER_STATS".
    6. MENU: If user asks for menu or wants to order something -> intent "SHOW_MENU".
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
  
  let user = await checkUserExists(phone);

  if (!user && aiIntent !== "PROVIDE_NAME" && aiIntent !== "GENERAL_INFO") {
    let replyText = "👑 *Welcome to The Galaxy Hotel!*\n\nIt is an absolute honor to receive you. As this is your first visit, may I humbly know your good name so I can address you properly?";
    userContextMemory[phone] = replyText;
    return { ...state, replyText };
  }

  const session = await getOrCreateSession(phone); 
  let replyText = "";

  switch (aiIntent) {
    
    case "GENERAL_INFO": {
      replyText = `🏨 *The Galaxy Hotel*\n\n📍 *Address:* PG College Road, Lalbagh, Chhindwara\n📞 *Contact:* +91 6262633305\n📧 *Email:* gmhotelthegalaxy@gmail.com\n\nReply *1* to view today's special menu or order a feast!`;
      break;
    }

    case "PROVIDE_NAME": {
      const extractedName = aiData?.user_name || inputText.trim() || "Guest";
      
      if (!user) {
         user = await registerNewUser(phone, extractedName);
      }
      
      replyText = `Splendid to meet you, *${user.fullName}*! 👑\n\nHow may I humbly serve you today, esteemed guest?\n\nReply with a number:\n*1.* 🍔 Order a Feast (Menu)\n*3.* ℹ️ Seek My Assistance (Help)\n\n*(You can also ask me for our address or contact info!)*`;
      break;
    }

    case "GREETING": {
      const hasActiveOrder = await getActiveOrder(user._id);
      replyText = `👑 *Welcome back, ${user.fullName}!*\n\nHow may I humbly serve you today?\n\nReply with a number:\n*1.* 🍔 Order a Feast (Menu)`;
      if (hasActiveOrder) replyText += `\n*2.* 📦 Track Your Royal Order`;
      replyText += `\n*3.* ℹ️ Seek My Assistance (Help)\n\n*(Type "Stats" to view your royal history or ask for our Location)*`;
      break;
    }

    case "TRACK_ORDER": {
      const orderToTrack = await getActiveOrder(user._id);
      if (orderToTrack) {
        const orderStatus = orderToTrack.status ? orderToTrack.status.toLowerCase() : "processing";
        const amount = orderToTrack.totalAmount || orderToTrack.pricing?.total || 0;
        
        replyText = `📦 *Your Active Order*\n\n🔖 Order ID: ${orderToTrack.orderNumber || orderToTrack._id}\n📊 Status: *${orderStatus.toUpperCase()}*\n💰 Amount: ₹${amount.toFixed(2)}`;
        
        if (orderToTrack.deliveryBoy && orderToTrack.deliveryBoy.phone) {
          replyText += `\n\n🛵 *Your Chariot Arrives:*\nRider: ${orderToTrack.deliveryBoy.name || "Executive"}\n📞 Contact: ${orderToTrack.deliveryBoy.phone}`;
        } else {
          replyText += `\n\n👨‍🍳 Our royal chefs are presently crafting your meal.`;
        }

        replyText += `\n\nWhat would you like to do?\n*1.* 🍔 Order More Delights`;

        const uncancelableStatuses = ["confirmed", "preparing", "dispatched", "out_for_delivery", "delivered"];
        
        if (!uncancelableStatuses.includes(orderStatus)) {
            replyText += `\n*2.* ❌ Cancel Order`;
        } else {
            replyText += `\n\n*(Note: Your order is already ${orderStatus.toUpperCase()}, so it cannot be cancelled now)*`;
        }
      } else {
        replyText = "Forgive me, my lord, but I do not see any active orders for you at this moment.\n\nReply *1* to browse the royal menu, or type *Stats* to see your order history.";
      }
      break;
    }

    case "CANCEL_ORDER": {
      const cancelledOrder = await cancelOrder(user._id);
      if (cancelledOrder) {
        replyText = `✅ *Order Cancelled Successfully*\n\nAs you command, your order has been halted.\n\nReply *1* whenever you wish to order again.`;
      } else {
        replyText = `❌ *Cannot Cancel Order*\n\nI humbly apologize, but you either have no active order, or it has been confirmed and progressed too far to be cancelled now.\n\nReply *1* to browse the menu.`;
      }
      break;
    }

    case "ORDER_STATS": {
      const stats = await getUserOrderStats(user._id);
      
      if (stats && stats.totalOrders > 0) {
        replyText = `📜 *Your Royal History, ${user.fullName}*\n\n🛍️ Total Orders Placed: *${stats.totalOrders}*\n✅ Successfully Delivered: *${stats.deliveredOrders}*\n❌ Cancelled Orders: *${stats.cancelledOrders}*\n\n💎 Total Treasure Spent: *₹${stats.totalSpent.toFixed(2)}*\n\nReply *1* whenever you wish to order again!`;
      } else {
        replyText = "You have not yet graced us with a completed order, my lord.\n\nReply *1* to explore our feasts and begin your royal journey.";
      }
      break;
    }

    case "HELP": {
      replyText = `🎧 *The Galaxy Hotel Servants at Your Beck & Call*\n\n📞 +91 6262633305\n📧 gmhotelthegalaxy@gmail.com\n\nReply *1* to behold the menu.`;
      break;
    }

    case "SHOW_MENU": {
      const items = await getTodayRosterItems();
      
      if (!items || items.length === 0) {
        replyText = "I am terribly sorry, my lord, but today's royal roster is currently empty. Our chefs are preparing the list. Pray, check back in a short while.";
      } else {
        const menuText = items.map((m, i) => `▪️ *${m.name}* - ₹${m.basePrice} _(Max limit: ${m.maxAllowed})_`).join("\n");
        replyText = `📜 *Today's Royal Feast Selection*\n\n${menuText}\n\n👉 *Please type what you desire to add to your cart (e.g., '2 ${items[0]?.name || "items"}')*`;
      }
      break;
    }

    case "ADD_TO_CART": {
      const itemsToAdd = aiData?.extracted_items || [];
      if (itemsToAdd.length === 0) {
        replyText = "Forgive my simple mind, my lord, but could you please specify the exact item and quantity? (e.g., '1 Pizza').";
      } else {
        const { cart, messages } = await addItemsToCart(phone, itemsToAdd);
        
        let cartSummary = cart.map(item => `▪️ ${item.quantity}x ${item.name} - ₹${item.total}`).join("\n");
        let subtotal = cart.reduce((sum, item) => sum + item.total, 0);
        let feedbackString = messages.join("\n"); 
        
        replyText = `${feedbackString}\n\n🛒 *Your Banquet So Far:*\n${cartSummary}\n💰 *Current Total: ₹${subtotal}*\n\nWhat is your next command? Reply with:\n*1.* ➕ Add More Delights\n*2.* ➡️ Proceed to Checkout`;
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

    // 🔥 UPDATED: Dynamic Address List with "+ Add a NEW Address" option
    case "CHECKOUT": {
      const addresses = await getUserAddresses(user._id);
      
      let addressPrompt = "📍 *Where shall we dispatch your royal feast?*\n\n";
      
      if (addresses && addresses.length > 0) {
        addressPrompt += "Reply with a number to choose a saved address:\n";
        const topAddresses = addresses.slice(0, 2); // Show max 2 saved addresses
        let nextIndex = 1;
        
        topAddresses.forEach((addr, index) => {
          const streetStr = addr.street || "";
          const landmarkStr = addr.landmark ? `, ${addr.landmark}` : "";
          addressPrompt += `*${index + 1}.* ${addr.label || "Home"} - ${streetStr}${landmarkStr}\n`;
          nextIndex = index + 2; // Calculate the next available number
        });
        
        // Add dynamic option for a new address
        addressPrompt += `\n*${nextIndex}.* ➕ Add a NEW Address\n`;
      } else {
        addressPrompt += "👉 *Please provide your delivery address in this exact format:*\n\nArea: 007, 8th floor bansal one\nLandmark: db mall";
      }
      
      replyText = addressPrompt;
      break;
    }

    // 🔥 UPDATED: Logic to handle both saved address selection AND the "Add new address" trigger
    case "SELECT_SAVED_ADDRESS": {
      const savedAddresses = await getUserAddresses(user._id);
      const topAddresses = savedAddresses.slice(0, 2); // Same logic as CHECKOUT
      const index = (aiData?.address_index || 1) - 1; 
      
      // Check if user selected the "➕ Add a NEW Address" option
      if (index === topAddresses.length) {
         replyText = "🏠 *Add a New Address*\n\nPlease provide your delivery address in this exact format:\n\nArea: 007, 8th floor bansal one\nLandmark: db mall";
         break;
      } 
      // Proceed with saved address
      else if (topAddresses[index]) {
         const addressId = topAddresses[index]._id;
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
           replyText = `✅ Address confirmed: ${topAddresses[index].street}\n\n💳 *Online Royal Treasury*\nGrand Total: *₹${paymentData.totalAmount.toFixed(2)}*\n\n👉 Please pay securely via Razorpay:\n🔗 ${paymentData.paymentUrl}\n\n*Aapka order auto-confirm ho jayega payment successful hote hi!*`;
           session.cart = []; 
           await session.save();
         } else {
           replyText = "Apologies, there was an issue generating your payment link. Please try again.";
         }
      } else {
         replyText = "Forgive me, but I do not recognize that choice. Please choose a valid number or type your address directly.";
      }
      break;
    }

    // 🔥 Handles the new address the user types after selecting "Add a NEW Address"
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
      replyText = "My deepest apologies, esteemed guest, but this humble servant did not quite catch your meaning. You may type 'Menu' to browse our royal feasts, 'Track' to see your order's journey, or ask for our 'Address'.";
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