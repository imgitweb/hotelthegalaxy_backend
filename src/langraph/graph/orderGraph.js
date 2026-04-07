require("dotenv").config();
const { StateGraph } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");
const { z } = require("zod");

const {
  checkUserExists, registerNewUser, getOrCreateSession, getActiveOrder,
  getTodayRosterItems, getUserAddresses, getUserOrderStats, getCategories, getMenuByCategory,
  saveNewAddress, addItemsToCart, placeOrder, cancelOrder, removeItemsFromCart, 
  processBotOrderAndPayment, checkLatestPaymentStatus
} = require("../tools/orderTools");

// 🔥 Context Memory
const userContextMemory = {}; 
const paymentAttemptsMemory = {}; 

const llm = new ChatOpenAI({ 
  openAIApiKey: process.env.OPENAI_API_KEY, 
  modelName: "gpt-4o-mini", 
  temperature: 0 
});

const IntentSchema = z.object({
  intent: z.enum([
    "GREETING", "SHOW_MENU", "SELECT_CATEGORY", "ADD_TO_CART", "REMOVE_FROM_CART", 
    "CHECKOUT", "PROVIDE_ADDRESS", "SELECT_SAVED_ADDRESS", "PROMPT_NEW_ADDRESS", "PROVIDE_NAME", 
    "COMPLETE_ORDER", "TRACK_ORDER", "ORDER_STATS", 
    "CANCEL_ORDER", "HELP", "GENERAL_INFO", "UNKNOWN" 
  ]).describe("Identify the core intent based on user input and the previous bot message context."),
  
  user_name: z.string().nullable(),
  extracted_items: z.array(z.object({ name: z.string(), quantity: z.number() })).nullable().describe("Extract food items and quantities. If user names food without quantity, assume 1."),
  address: z.object({ area: z.string(), landmark: z.string() }).nullable(),
  address_index: z.number().nullable().describe("If user replies with a number to select an address"),
  category_name: z.string().nullable().describe("Extract the category name like 'Thali', 'Soup', 'Dal', 'Rice', 'Chinese' if user types it.")
});

const aiBrain = llm.withStructuredOutput(IntentSchema, { strict: true });

async function agentDecisionNode(state) {
  const msg = (state.inputText || "").trim().toLowerCase();
  const phone = state.phone;
  const previousBotMessage = userContextMemory[phone] || "None";
  
  console.log(`🧐 Memory Context for ${phone}:`, previousBotMessage.substring(0, 80).replace(/\n/g, ' ') + "...");

  // 🔥 1. CONTEXT AWARE INTERCEPTS
  const isAskingAddress = previousBotMessage.toLowerCase().includes("where shall we dispatch") || previousBotMessage.toLowerCase().includes("where to dispatch");
  
  if (isAskingAddress) {
    if (msg === "home" || msg.includes("home") || msg === "1") {
      return { ...state, aiIntent: "SELECT_SAVED_ADDRESS", aiData: { address_index: 1 } };
    }
    if (msg.includes("add new") || msg === "2" || msg === "3" || msg.includes("btn_new_address")) {
      return { ...state, aiIntent: "PROMPT_NEW_ADDRESS", aiData: {} };
    }
  }

  // 🔥 2. BULLETPROOF FAST ROUTING
  if (msg.startsWith("cat_")) {
    return { ...state, aiIntent: "SELECT_CATEGORY", aiData: { categoryId: msg.replace("cat_", "") } };
  }
  if (msg.startsWith("addr_")) {
    return { ...state, aiIntent: "SELECT_SAVED_ADDRESS", aiData: { addressId: msg.replace("addr_", "") } };
  }

  if (msg.includes("btn_menu") || msg.includes("order menu") || msg === "menu") return { ...state, aiIntent: "SHOW_MENU", aiData: {} };
  if (msg.includes("btn_track") || msg.includes("track order") || msg === "track") return { ...state, aiIntent: "TRACK_ORDER", aiData: {} };
  if (msg.includes("btn_help") || msg.includes("help")) return { ...state, aiIntent: "HELP", aiData: {} };
  if (msg.includes("btn_checkout") || msg.includes("checkout")) return { ...state, aiIntent: "CHECKOUT", aiData: {} };
  if (msg.includes("btn_add_more") || msg.includes("add more")) return { ...state, aiIntent: "SHOW_MENU", aiData: {} };
  if (msg.includes("btn_cancel_order") || msg.includes("cancel order")) return { ...state, aiIntent: "CANCEL_ORDER", aiData: {} };

  // Normal Greetings Check 
  if (["hi", "hello", "start", "hy"].includes(msg)) return { ...state, aiIntent: "GREETING", aiData: {} };
  if (msg === "home" && !isAskingAddress) return { ...state, aiIntent: "GREETING", aiData: {} };
  
  if (msg.includes("stats") || msg.includes("history")) return { ...state, aiIntent: "ORDER_STATS", aiData: {} };

  // 🔥 3. LLM Processing
  const prompt = `
    You are an intelligent order routing AI for "The Galaxy Hotel".
    CRITICAL INSTRUCTION: Read the 'BOT_LAST_MESSAGE' to understand what the user is replying to.

    === CONTEXT ===
    BOT_LAST_MESSAGE: """${previousBotMessage}"""
    USER_REPLY: """${state.inputText}"""
    
    === STRICT DECISION RULES ===
    1. CATEGORY BROWSE (CRITICAL): If USER_REPLY is a food category (like "Thali", "Soup", "Dal", "Starter", "Main Course", "Rice", "Chinese") WITHOUT a quantity -> intent MUST be "SELECT_CATEGORY" and extract 'category_name'. NEVER return SHOW_MENU for this.
    2. ADDRESS SELECTION: If BOT_LAST_MESSAGE asks "Where shall we dispatch", ANY address detail typed means "PROVIDE_ADDRESS". NEVER return GREETING.
    3. ADD TO CART: ONLY trigger "ADD_TO_CART" if the user explicitly types a FOOD ITEM to order (e.g., "1 Thali", "add paneer", "Veg Diwani Handi"). If quantity is missing, assume 1.
    4. COMPLETE ORDER: If BOT_LAST_MESSAGE contains "Razorpay" AND USER_REPLY means "done", "paid", or "yes" -> intent "COMPLETE_ORDER".
    5. ONBOARDING: If BOT_LAST_MESSAGE asks for the user's name -> intent "PROVIDE_NAME".
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
    return { ...state, replyText, interactive: null };
  }

  const session = await getOrCreateSession(phone); 
  let replyText = "";
  let interactive = null; 

  switch (aiIntent) {
    
    case "PROVIDE_NAME": {
      const extractedName = aiData?.user_name || inputText.trim() || "Guest";
      if (!user) user = await registerNewUser(phone, extractedName);
      
      replyText = `Splendid to meet you, *${user.fullName}*! 👑\n\nHow may I humbly serve you today?`;
      interactive = {
        type: "button",
        body: { text: replyText },
        action: {
          buttons: [
            { type: "reply", reply: { id: "btn_menu", title: "🍔 Order Menu" } },
            { type: "reply", reply: { id: "btn_help", title: "ℹ️ Help" } }
          ]
        }
      };
      break;
    }

    case "GREETING": {
      const hasActiveOrder = await getActiveOrder(user._id);
      replyText = `👑 *Welcome back, ${user.fullName}!*\n\nHow may I humbly serve you today?`;
      
      let buttons = [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Order Menu" } }];
      if (hasActiveOrder) {
        buttons.push({ type: "reply", reply: { id: "btn_track", title: "📦 Track Order" } });
      }
      buttons.push({ type: "reply", reply: { id: "btn_help", title: "ℹ️ Help" } });

      interactive = {
        type: "button",
        body: { text: replyText },
        action: { buttons }
      };
      break;
    }

    case "HELP": {
      replyText = `🎧 *The Galaxy Hotel Support*\n\n📞 Call us: +916262633305\n📧 gmhotelthegalaxy@gmail.com\n\n(Tap the number above to call us directly!)`;
      interactive = {
        type: "button",
        body: { text: replyText },
        action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Back to Menu" } }] }
      };
      break;
    }

    case "SHOW_MENU": {
      const categories = await getCategories();
      if (!categories || categories.length === 0) {
        replyText = "Our chefs are preparing today's royal menu. Please check back shortly!";
        break;
      }

      const rows = categories.slice(0, 10).map(cat => ({
        id: `cat_${cat._id}`,
        title: cat.name.substring(0, 24),
        description: "Tap to view delicacies"
      }));

      interactive = {
        type: "list",
        header: { type: "text", text: "🍽️ The Galaxy Menu" },
        body: { text: "Tap the button below to view all our categories 👇" },
        action: {
          button: "📋 View Categories",
          sections: [{ title: "Our Offerings", rows: rows }]
        }
      };
      break;
    }

    case "SELECT_CATEGORY": {
      let categoryId = aiData?.categoryId;
      let categoryItems = [];
      let categoryName = aiData?.category_name || inputText;

      if (!categoryId && categoryName) {
        const searchName = categoryName.toLowerCase().trim();
        const categories = await getCategories();
        const matchedCat = categories.find(c => 
           c.name.toLowerCase() === searchName || 
           c.name.toLowerCase().includes(searchName) || 
           searchName.includes(c.name.toLowerCase())
        );
        
        if (matchedCat) {
          categoryId = matchedCat._id;
          categoryName = matchedCat.name; 
        }
      }

      if (categoryId) {
        categoryItems = await getMenuByCategory(categoryId);
      }

      if (!categoryItems || categoryItems.length === 0) {
        replyText = `Maaf kijiyega, aaj *${categoryName || "is category"}* mein koi item available nahi hai. 👨‍🍳`;
        interactive = {
          type: "button",
          body: { text: replyText },
          action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 View All Menu" } }] }
        };
      } else {
        const menuText = categoryItems.map(m => `▪️ *${m.name}* - ₹${m.basePrice}`).join("\n");
        replyText = `📜 *${categoryName || 'Selected'} Delicacies*\n\n${menuText}\n\n👉 *Aapko kya order karna hai? (Jaise: '1 ${categoryItems[0].name}')*`;
      }
      break;
    }

    case "ADD_TO_CART": {
      const itemsToAdd = aiData?.extracted_items || [];
      if (itemsToAdd.length === 0) {
        replyText = "Please specify the exact item and quantity you wish to add.";
      } else {
        const { cart, messages } = await addItemsToCart(phone, itemsToAdd);
        
        let cartSummary = cart.map(item => `▪️ ${item.quantity}x ${item.name} - ₹${item.total}`).join("\n");
        let subtotal = cart.reduce((sum, item) => sum + item.total, 0);
        let feedbackString = messages.join("\n"); 
        
        replyText = `${feedbackString}\n\n🛒 *Your Banquet So Far:*\n${cartSummary}\n💰 *Current Total: ₹${subtotal}*\n\nWhat is your next command?`;
        
        interactive = {
          type: "button",
          body: { text: replyText },
          action: {
            buttons: [
              { type: "reply", reply: { id: "btn_add_more", title: "➕ Add More" } },
              { type: "reply", reply: { id: "btn_checkout", title: "➡️ Checkout" } }
            ]
          }
        };
      }
      break;
    }

    case "CHECKOUT": {
      const addresses = await getUserAddresses(user._id);
      
      if (addresses && addresses.length > 0) {
        const topAddresses = addresses.slice(0, 2); 
        
        // 🔥 FIX: WhatsApp Button titles must be unique. 
        // We prepend the index to make them unique (e.g., "1. Home", "2. Home")
        let buttons = topAddresses.map((addr, idx) => {
          let label = addr.label || "Address";
          let uniqueTitle = `${idx + 1}. ${label}`.substring(0, 20); // max 20 chars
          return {
            type: "reply",
            reply: { id: `addr_${addr._id}`, title: uniqueTitle }
          };
        });
        
        buttons.push({ type: "reply", reply: { id: "btn_new_address", title: "➕ Add NEW" } });

        let addressDetails = topAddresses.map((addr, idx) => 
          `*${idx + 1}. ${addr.label || "Address"}*: ${addr.street}, ${addr.landmark}`
        ).join("\n");
        
        addressDetails += `\n*${topAddresses.length + 1}.* ➕ Add a NEW Address`;

        interactive = {
          type: "button",
          body: { text: `📍 *Where shall we dispatch your royal feast?*\n\n${addressDetails}\n\nTap a button below or reply with a number to select:` },
          action: { buttons }
        };
      } else {
        replyText = "🏠 *New Address*\n\n👉 Please provide your delivery address in this format:\n\nArea: 007, 8th floor bansal one\nLandmark: DB Mall";
      }
      break;
    }

    case "PROMPT_NEW_ADDRESS": {
      replyText = "🏠 *New Address*\n\n👉 Please provide your delivery address in this format:\n\nArea: 007, 8th floor bansal one\nLandmark: DB Mall";
      break;
    }

    case "SELECT_SAVED_ADDRESS": {
      let addressId = aiData?.addressId; 
      
      if (!addressId) {
        const savedAddresses = await getUserAddresses(user._id);
        const topAddresses = savedAddresses.slice(0, 2);
        let selectedIdx = (aiData?.address_index || 1) - 1;

        if (inputText.toLowerCase().includes("home")) {
          selectedIdx = 0; 
        }

        if (selectedIdx >= 0 && selectedIdx < topAddresses.length) {
          addressId = topAddresses[selectedIdx]._id.toString();
        } else {
          replyText = "🏠 *New Address*\n\n👉 Please provide your delivery address in this format:\n\nArea: 007, 8th floor bansal one\nLandmark: DB Mall";
          userContextMemory[phone] = replyText;
          return { ...state, replyText, interactive: null }; 
        }
      }

      session.addressId = addressId;
      await session.save();
      
      const cartItems = session.cart || [];
      if(cartItems.length === 0) {
         replyText = "Your cart is empty. Please open the Menu to add items.";
         break;
      }

      const paymentData = await processBotOrderAndPayment(user._id, phone, cartItems, addressId);
      if (paymentData.success) {
        paymentAttemptsMemory[phone] = 0; 
        const selectedAddr = await getUserAddresses(user._id).then(addrs => addrs.find(a => a._id.toString() === addressId));
        
        replyText = `✅ *Address Confirmed:* ${selectedAddr?.street || 'Home'}\n\n💳 *Online Royal Treasury*\nGrand Total: *₹${paymentData.totalAmount.toFixed(2)}*\n\n*(Aapka order auto-confirm ho jayega payment successful hote hi!)*`;
        
        interactive = {
          type: "cta_url",
          body: { text: replyText },
          action: {
            name: "cta_url",
            parameters: {
              display_text: `Pay ₹${paymentData.totalAmount.toFixed(2)}`,
              url: paymentData.paymentUrl
            }
          }
        };
        
        session.cart = []; 
        await session.save();
      } else {
        replyText = "Apologies, there was an issue generating your payment link. Please try again.";
      }
      break;
    }

    case "PROVIDE_ADDRESS": {
      const extractedAddress = aiData?.address || { area: inputText, landmark: "" };
      const newAddr = await saveNewAddress(user._id, extractedAddress);
      session.addressId = newAddr._id;
      await session.save();

      const cartItems = session.cart || [];
      if(cartItems.length === 0) {
         replyText = "Your cart is empty. Please open the Menu to add items.";
         break;
      }

      const paymentData = await processBotOrderAndPayment(user._id, phone, cartItems, newAddr._id);
      if (paymentData.success) {
        paymentAttemptsMemory[phone] = 0; 
        
        replyText = `✅ *New Address Saved:* ${newAddr.street}\n\n💳 *Online Royal Treasury*\nGrand Total: *₹${paymentData.totalAmount.toFixed(2)}*\n\n*(Aapka order auto-confirm ho jayega payment successful hote hi!)*`;
        
        interactive = {
          type: "cta_url",
          body: { text: replyText },
          action: {
            name: "cta_url",
            parameters: {
              display_text: `Pay ₹${paymentData.totalAmount.toFixed(2)}`,
              url: paymentData.paymentUrl
            }
          }
        };
        
        session.cart = []; 
        await session.save();
      } else {
        replyText = "Apologies, there was an issue generating your payment link. Please try again.";
      }
      break;
    }

    case "TRACK_ORDER": {
      const orderToTrack = await getActiveOrder(user._id);
      if (orderToTrack) {
        const orderStatus = orderToTrack.status ? orderToTrack.status.toLowerCase() : "processing";
        const amount = orderToTrack.totalAmount || orderToTrack.pricing?.total || 0;
        
        replyText = `📦 *Your Active Order*\n\n🔖 Order ID: ${orderToTrack.orderNumber || orderToTrack._id}\n📊 Status: *${orderStatus.toUpperCase()}*\n💰 Amount: ₹${amount.toFixed(2)}\n\n`;
        
        if (["dispatched", "out_for_delivery"].includes(orderStatus) && orderToTrack.deliveryBoy) {
          replyText += `🛵 *Your Order is Arriving!*\nRider: ${orderToTrack.deliveryBoy.name || "Executive"}\n📞 Contact: ${orderToTrack.deliveryBoy.phone}\n\n`;
        } else {
          replyText += `👨‍🍳 Our royal chefs are presently crafting your meal.\n\n`;
        }

        const uncancelableStatuses = ["confirmed", "preparing", "dispatched", "out_for_delivery", "delivered"];
        let buttons = [{ type: "reply", reply: { id: "btn_add_more", title: "🍔 Order More" } }];
        
        if (!uncancelableStatuses.includes(orderStatus)) {
            buttons.push({ type: "reply", reply: { id: "btn_cancel_order", title: "❌ Cancel Order" } });
        }

        interactive = {
          type: "button",
          body: { text: replyText },
          action: { buttons }
        };

      } else {
        replyText = "Forgive me, but I do not see any active orders for you at this moment.";
        interactive = {
          type: "button",
          body: { text: replyText },
          action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Order Menu" } }] }
        };
      }
      break;
    }

    case "CANCEL_ORDER": {
      const cancelledOrder = await cancelOrder(user._id);
      if (cancelledOrder) {
        replyText = `✅ *Order Cancelled Successfully*\n\nAs you command, your order has been halted.`;
      } else {
        replyText = `❌ *Cannot Cancel Order*\n\nI humbly apologize, but you either have no active order, or it has progressed too far to be cancelled now.`;
      }
      interactive = {
        type: "button",
        body: { text: replyText },
        action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Order Menu" } }] }
      };
      break;
    }

    case "COMPLETE_ORDER": {
      const paymentCheck = await checkLatestPaymentStatus(user._id);

      if (!paymentCheck.found) {
        replyText = "I couldn't find any pending orders. Start a new order below.";
        interactive = {
          type: "button",
          body: { text: replyText },
          action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Order Menu" } }] }
        };
        break;
      }

      if (paymentCheck.isPaid) {
        paymentAttemptsMemory[phone] = 0; 
        replyText = `🎉 *Payment Confirmed!*\n\nOrder ID: *${paymentCheck.orderNumber}*\n\nOur grand chefs are firing up the ovens! 👨‍🍳🔥`;
        interactive = {
          type: "button",
          body: { text: replyText },
          action: { buttons: [{ type: "reply", reply: { id: "btn_track", title: "📦 Track Order" } }] }
        };
      } else {
        let attempts = (paymentAttemptsMemory[phone] || 0) + 1;
        paymentAttemptsMemory[phone] = attempts; 

        if (attempts >= 3) {
          await cancelOrder(user._id);
          paymentAttemptsMemory[phone] = 0; 
          replyText = `❌ *Order Cancelled*\n\nWe haven't received payment after 3 attempts. Your order has been cancelled for security reasons.`;
          interactive = {
            type: "button",
            body: { text: replyText },
            action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Order Menu" } }] }
          };
        } else {
          replyText = `⚠️ *Payment Not Received Yet*\n\nI just checked the treasury, but payment hasn't reflected yet. *(Attempt ${attempts}/3)*\n\nPlease pay using the link provided above, then type "paid" again.`;
        }
      }
      break;
    }

    case "ORDER_STATS": {
      const stats = await getUserOrderStats(user._id);
      if (stats && stats.totalOrders > 0) {
        replyText = `📜 *Your Royal History*\n\n🛍️ Total Orders: *${stats.totalOrders}*\n✅ Delivered: *${stats.deliveredOrders}*\n❌ Cancelled: *${stats.cancelledOrders}*\n💎 Total Spent: *₹${stats.totalSpent.toFixed(2)}*`;
      } else {
        replyText = "You have not yet graced us with a completed order, my lord.";
      }
      interactive = {
        type: "button",
        body: { text: replyText },
        action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Order Menu" } }] }
      };
      break;
    }

    default: {
      replyText = "My deepest apologies, esteemed guest, I didn't quite catch that. How may I help you?";
      interactive = {
        type: "button",
        body: { text: replyText },
        action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }, { type: "reply", reply: { id: "btn_track", title: "📦 Track" } }] }
      };
    }
  }

  const finalBotTextToSave = interactive ? interactive.body.text : replyText;
  userContextMemory[phone] = finalBotTextToSave;
  
  return { ...state, replyText, interactive }; 
}

function buildOrderGraph() {
  const graph = new StateGraph({
    channels: {
      phone: { value: (old, n) => n ?? old, default: () => "" },
      inputText: { value: (old, n) => n ?? old, default: () => "" },
      aiIntent: { value: (old, n) => n ?? old, default: () => "GREETING" },
      aiData: { value: (old, n) => n ?? old, default: () => ({}) },
      replyText: { value: (old, n) => n ?? old, default: () => "" },
      interactive: { value: (old, n) => n ?? old, default: () => null } 
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