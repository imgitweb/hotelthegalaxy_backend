require("dotenv").config(); 
const { StateGraph } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");
const { z } = require("zod");

const Order = require("../../models/User/ordersModel");

const {
  checkUserExists, registerNewUser, getOrCreateSession, getActiveOrder, getActiveOrdersToday,
  getPendingOrders, getPaymentLinkByOrderId, getAvailabilityStatus, // 🔥 NEW IMPORTS
  getTodayRosterItems, searchTodayRosterItems, getUserAddresses, getUserOrderStats, 
  getCategories, getMenuByCategory, getAvailableCategoriesToday,
  saveNewAddress, addItemsToCart, placeOrder, cancelOrder, removeItemsFromCart, 
  processBotOrderAndPayment, checkLatestPaymentStatus, verifyDeliveryLocation, 
  verifyLocationByCoords, getActiveOffers 
} = require("../tools/orderTools");

const userContextMemory = {}; 
const paymentAttemptsMemory = {}; 
const pendingLocationMemory = {}; 
const pendingQuantityMemory = {}; 

const HOTEL_LOGO_URL = process.env.LOGO_IMG_URL || "https://instasize.com/api/image/3aabe1c01be83d90190437a6172108e4457cbbe58d3500147dfeb5d8d567bc90.jpeg";

const llm = new ChatOpenAI({ 
  openAIApiKey: process.env.OPENAI_API_KEY, 
  modelName: "gpt-4o-mini", 
  temperature: 0 
});

const IntentSchema = z.object({
  intent: z.enum([
    "GREETING", "SHOW_MENU", "SELECT_CATEGORY", "SEARCH_ITEM", "ADD_TO_CART", "REMOVE_FROM_CART", 
    "CHECKOUT", "PROVIDE_ADDRESS", "PROVIDE_SHARED_LOCATION", "PROVIDE_HOUSE_NUMBER", "SELECT_SAVED_ADDRESS", "PROMPT_NEW_ADDRESS", "PROVIDE_NAME", 
    "CONFIRM_ADDRESS_YES", "CONFIRM_ADDRESS_NO", // 🔥 NEW INTENTS
    "COMPLETE_ORDER", "TRACK_ORDER", "ORDER_STATS", 
    "CANCEL_ORDER", "HELP", "GENERAL_INFO", "SHOW_OFFERS", "SHOW_ALL_TODAY", "PROMPT_QUANTITY", "HANDLE_QUANTITY_SELECTION", 
    "VIEW_PENDING_ORDERS", "PAY_SPECIFIC_ORDER", 
    "UNKNOWN" 
  ]).describe("Identify the core intent based on user input and the previous bot message context."),
  
  user_name: z.string().nullable(),
  extracted_items: z.array(z.object({ name: z.string(), quantity: z.number() })).nullable(),
  address: z.object({ area: z.string(), landmark: z.string() }).nullable(),
  house_number: z.string().nullable(),
  address_index: z.number().nullable(),
  category_name: z.string().nullable(),
  search_query: z.string().nullable(),
  item_name: z.string().nullable(),
  quantity: z.number().nullable(),
  order_id: z.string().nullable() 
});

const aiBrain = llm.withStructuredOutput(IntentSchema, { strict: true });

function getCategoryIcon(catName) {
  const name = catName.toLowerCase();
  if (name.includes("starter")) return "🥟";
  if (name.includes("main course") || name.includes("sabzi")) return "🍛";
  if (name.includes("bread") || name.includes("roti") || name.includes("naan") || name.includes("kulcha")) return "🫓";
  if (name.includes("rice") || name.includes("biryani") || name.includes("pulao")) return "🍚";
  if (name.includes("dessert") || name.includes("sweet") || name.includes("ice cream")) return "🍨";
  if (name.includes("beverage") || name.includes("drink") || name.includes("shake")) return "🍹";
  if (name.includes("thali")) return "🍱";
  if (name.includes("pizza")) return "🍕";
  if (name.includes("chinese") || name.includes("noodle") || name.includes("manchurian") || name.includes("pasta")) return "🍜";
  if (name.includes("combo")) return "📦";
  if (name.includes("soup")) return "🥣";
  if (name.includes("salad") || name.includes("papad") || name.includes("raita")) return "🥗";
  if (name.includes("paneer")) return "🧀";
  if (name.includes("dal")) return "🍲";
  if (name.includes("breakfast") || name.includes("nashta") || name.includes("snack")) return "🥪";
  if (name.includes("burger") || name.includes("fast food")) return "🍔";
  if (name.includes("south indian") || name.includes("dosa") || name.includes("idli")) return "🌮";
  return "🍽️"; 
}

function createInteractiveMenu(items, listTitle, listBody) {
  const rows = items.slice(0, 10).map(item => {
    let descText = `₹${item.basePrice}`;
    if (item.originalPrice && item.originalPrice > item.basePrice) {
        descText = `₹${item.basePrice} (Offer) | was ₹${item.originalPrice}`;
    }

    if (item.isCombo && item.includedItems) {
        descText += ` | ${item.includedItems}`;
    } else {
        descText += ` | Tap karke add karein`;
    }

    return {
      id: `add_${item.name}`, 
      title: item.name.substring(0, 24),
      description: descText.substring(0, 72)
    };
  });

  return {
    type: "list",
    header: { type: "text", text: listTitle.substring(0, 60) },
    body: { text: listBody },
    action: {
      button: "🛒 Items Dekhein",
      sections: [{ title: "Menu Items", rows: rows }]
    }
  };
}

async function agentDecisionNode(state) {
  const rawMsg = state.inputText || "";
  const msg = rawMsg.trim().toLowerCase();
  const phone = state.phone;
  const locationData = state.location; 
  const previousBotMessage = (userContextMemory[phone] || "None").toLowerCase();
  
  if (msg === "shared_location" || locationData) {
    return { ...state, aiIntent: "PROVIDE_SHARED_LOCATION", aiData: { location: locationData } };
  }

  const isAskingName = previousBotMessage.includes("apna naam");
  if (isAskingName && msg.length > 0) {
    if (msg.includes("btn_") || msg.includes("skip")) {
       return { ...state, aiIntent: "SHOW_MENU", aiData: {} };
    }
    return { ...state, aiIntent: "PROVIDE_NAME", aiData: { user_name: rawMsg } };
  }

  // 🔥 FIX: Address Confirmation Interceptors
  if (msg === "btn_confirm_address_yes" || msg === "yes proceed") {
      return { ...state, aiIntent: "CONFIRM_ADDRESS_YES", aiData: {} };
  }
  if (msg === "btn_confirm_address_no" || msg === "change address") {
      return { ...state, aiIntent: "CONFIRM_ADDRESS_NO", aiData: {} };
  }

  if (previousBotMessage.includes("makaan/flat number")) {
    return { ...state, aiIntent: "PROVIDE_HOUSE_NUMBER", aiData: { house_number: rawMsg } };
  }

  const isAskingAddress = previousBotMessage.includes("kahan deliver karna hai") || previousBotMessage.includes("delivery address") || previousBotMessage.includes("naya address");
  if (isAskingAddress) {
    if (msg === "home" || msg.includes("home") || msg === "1") return { ...state, aiIntent: "SELECT_SAVED_ADDRESS", aiData: { address_index: 1 } };
    if (msg.includes("add new") || msg === "2" || msg === "3" || msg.includes("btn_new_address")) return { ...state, aiIntent: "PROMPT_NEW_ADDRESS", aiData: {} };
  }

  if (msg === "btn_pay_pending" || msg === "pay pending") {
    return { ...state, aiIntent: "VIEW_PENDING_ORDERS", aiData: {} };
  }
  if (msg.startsWith("pay_ord_")) {
    return { ...state, aiIntent: "PAY_SPECIFIC_ORDER", aiData: { order_id: rawMsg.replace("pay_ord_", "") } };
  }

  if (msg.startsWith("add_")) {
    const itemName = rawMsg.trim().substring(4); 
    return { ...state, aiIntent: "PROMPT_QUANTITY", aiData: { item_name: itemName } };
  }

  if (msg.startsWith("qty_")) {
    const qty = parseInt(msg.substring(4)); 
    return { ...state, aiIntent: "HANDLE_QUANTITY_SELECTION", aiData: { quantity: qty } };
  }

  if (msg.startsWith("cat_")) return { ...state, aiIntent: "SELECT_CATEGORY", aiData: { categoryId: msg.replace("cat_", "") } };
  if (msg.startsWith("addr_")) return { ...state, aiIntent: "SELECT_SAVED_ADDRESS", aiData: { addressId: msg.replace("addr_", "") } };

  if (msg.includes("btn_menu") || msg === "menu" || msg.includes("menu dekhein")) return { ...state, aiIntent: "SHOW_MENU", aiData: {} };
  if (msg.includes("btn_add_more") || msg.includes("add more") || msg.includes("aur add")) return { ...state, aiIntent: "SHOW_MENU", aiData: {} };
  if (msg.includes("btn_checkout") || msg.includes("checkout")) return { ...state, aiIntent: "CHECKOUT", aiData: {} };
  if (msg.includes("btn_track") || msg.includes("track order") || msg === "track") return { ...state, aiIntent: "TRACK_ORDER", aiData: {} };
  if (msg.includes("btn_help") || msg.includes("help")) return { ...state, aiIntent: "HELP", aiData: {} };
  if (msg.includes("btn_cancel_order") || msg.includes("cancel order")) return { ...state, aiIntent: "CANCEL_ORDER", aiData: {} };
  if (msg.includes("btn_offers") || msg === "offers") return { ...state, aiIntent: "SHOW_OFFERS", aiData: {} };
  if (msg.includes("all items") || msg === "all menu") return { ...state, aiIntent: "SHOW_ALL_TODAY", aiData: {} };

  if (["hi", "hello", "start", "hy", "namaste"].includes(msg)) return { ...state, aiIntent: "GREETING", aiData: {} };
  if (msg === "home" && !isAskingAddress) return { ...state, aiIntent: "GREETING", aiData: {} };
  if (msg.includes("stats") || msg.includes("history")) return { ...state, aiIntent: "ORDER_STATS", aiData: {} };

  const prompt = `
    You are an intelligent order routing AI for "Hotel The Galaxy".
    === CONTEXT ===
    BOT_LAST_MESSAGE: """${previousBotMessage}"""
    USER_REPLY: """${state.inputText}"""
    
    === STRICT DECISION RULES ===
    1. PROMPT QUANTITY: If the user replies with JUST a FOOD ITEM NAME with NO clear NUMBER/QUANTITY, your intent MUST be "PROMPT_QUANTITY" and extract 'item_name'. DO NOT use ADD_TO_CART.
    2. CATEGORY BROWSE: If USER_REPLY is a food category WITHOUT a quantity -> intent MUST be "SELECT_CATEGORY".
    3. ADD TO CART: ONLY trigger "ADD_TO_CART" if the user explicitly types a FOOD ITEM WITH A NUMBER/QUANTITY (e.g., "add 2 Veg Thali"). 
    4. REMOVE FROM CART: If user asks to remove/delete an item -> intent "REMOVE_FROM_CART" and extract items.
    5. COMPLETE ORDER: If BOT_LAST_MESSAGE contains "Razorpay" AND USER_REPLY means "done" or "paid" -> intent "COMPLETE_ORDER".
  `;

  try {
    const aiDecision = await aiBrain.invoke(prompt);
    
    if (aiDecision.intent === "ADD_TO_CART" && aiDecision.extracted_items && aiDecision.extracted_items.length > 0) {
      const hasNumber = /\d/.test(msg);
      if (!hasNumber) {
        return { ...state, aiIntent: "PROMPT_QUANTITY", aiData: { item_name: aiDecision.extracted_items[0].name } };
      }
    }

    return { ...state, aiIntent: aiDecision.intent, aiData: aiDecision };
  } catch (error) { return { ...state, aiIntent: "UNKNOWN", aiData: {} }; }
}

async function actionExecutionNode(state) {
  const { aiIntent, aiData, phone, inputText } = state;
  let user = await checkUserExists(phone);

  const availStatus = await getAvailabilityStatus();

  if (!user && aiIntent !== "PROVIDE_NAME") {
    if (aiIntent === "SHOW_MENU" || inputText.toLowerCase().includes("skip") || inputText.toLowerCase().includes("btn_")) {
        user = await registerNewUser(phone, "Guest");
    } else {
        let replyText = `👑 *Welcome to Hotel The Galaxy!*\n${availStatus.message}\n\nKripya apna naam type karke bhejein,\ntaaki hum aapko behtar serve kar sakein.`;
        userContextMemory[phone] = replyText;
        
        let interactive = { 
          type: "button", 
          header: { type: "image", image: { link: HOTEL_LOGO_URL } },
          body: { text: replyText }, 
          action: { buttons: [ { type: "reply", reply: { id: "btn_menu", title: "🍔 Skip & See Menu" } } ] } 
        };
        return { ...state, replyText, interactive };
    }
  }

  // 🔥 FIX: Strict Availability Check for Order Actions
  const orderIntents = ["PROMPT_QUANTITY", "HANDLE_QUANTITY_SELECTION", "ADD_TO_CART", "CHECKOUT"];
  if (orderIntents.includes(aiIntent)) {
      if (!availStatus.isOpen) {
          let replyText = availStatus.message;
          let interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 View Menu Only" } }] } };
          userContextMemory[phone] = replyText;
          return { ...state, replyText, interactive };
      }
  }

  const session = await getOrCreateSession(phone); 
  let replyText = "";
  let interactive = null; 

  switch (aiIntent) {
    case "PROVIDE_NAME": {
      const extractedName = aiData?.user_name || inputText.trim() || "Guest";
      if (!user) user = await registerNewUser(phone, extractedName);
      replyText = `Aapse milkar accha laga, *${user.fullName}*! 👑\n${availStatus.message}\n\nAaj aap kya order karna chahenge?`;
      interactive = { 
        type: "button", 
        header: { type: "image", image: { link: HOTEL_LOGO_URL } },
        body: { text: replyText }, 
        action: { buttons: [ { type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }, { type: "reply", reply: { id: "btn_offers", title: "🎁 Offers" } }, { type: "reply", reply: { id: "btn_help", title: "ℹ️ Help" } } ] } 
      };
      break;
    }
    case "GREETING": {
      const activeOrders = await getActiveOrdersToday(user._id);
      replyText = `👑 *Welcome back, ${user.fullName}!*\n${availStatus.message}\n\nHotel The Galaxy mein aapka swagat hai.\nAaj kya order karna chahenge aap?`;
      let buttons = [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }];
      if (activeOrders && activeOrders.length > 0) { buttons.push({ type: "reply", reply: { id: "btn_track", title: "📦 Track" } }); }
      buttons.push({ type: "reply", reply: { id: "btn_offers", title: "🎁 Offers" } });
      if (buttons.length < 3) { buttons.push({ type: "reply", reply: { id: "btn_help", title: "ℹ️ Help" } }); }
      
      interactive = { 
        type: "button", 
        header: { type: "image", image: { link: HOTEL_LOGO_URL } },
        body: { text: replyText }, 
        action: { buttons } 
      };
      break;
    }
    case "HELP": {
      replyText = `🎧 *Hotel The Galaxy Support*\n\n📞 Call karein: +916262633305\n📧 Email: gmhotelthegalaxy@gmail.com\n\n*(Upar diye number par tap karke aap direct call kar sakte hain!)*`;
      interactive = { type: "button", body: { text: replyText }, action: { buttons: [ { type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }, { type: "reply", reply: { id: "btn_offers", title: "🎁 Offers" } } ] } };
      break;
    }
    case "SHOW_OFFERS": {
      const data = await getActiveOffers();
      const offers = data.offers || [];
      const combos = data.combos || [];
      
      if (offers.length === 0 && combos.length === 0) {
        replyText = "Abhi koi special offer nahi chal raha hai.\nKripya thodi der baad check karein!";
      } else {
        let offerText = "";
        
        if (offers.length > 0) {
            offerText += "*🔥 Today's Special Discounts:*\n\n";
            offers.forEach(o => {
                offerText += `🎉 *${o.name}*\n`;
                if(o.discountType === 'PERCENTAGE') offerText += `👉 ${o.discountValue}% OFF!\n`;
                if(o.discountType === 'FLAT') offerText += `👉 Flat ₹${o.discountValue} OFF!\n`;
                if(o.items && o.items.length > 0 && o.items[0].name) {
                    const itemNames = o.items.map(i => i.name).join(", ");
                    offerText += `✅ Valid on: ${itemNames}\n`;
                }
                offerText += "\n";
            });
        }
        
        if (combos.length > 0) {
            offerText += "*📦 Special Combos:*\n\n";
            combos.forEach(c => {
                 offerText += `🍔 *${c.name}* - ₹${c.price}\n`;
                 if (c.items && c.items.length > 0) {
                     const itemNames = c.items.map(i => i.item && i.item.name ? i.item.name : "").filter(Boolean).join(" + ");
                     if (itemNames) offerText += `👉 Includes: ${itemNames}\n`;
                 }
                 offerText += "\n";
            });
        }
        
        replyText = `🎁 *Hotel The Galaxy Deals:*\n\n${offerText}\n(Combo aur Offer items order karne ke liye Menu par click karein!)`;
      }
      interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu Dekhein" } }] } };
      break;
    }
    case "SHOW_ALL_TODAY": {
      const items = await getTodayRosterItems();
      if (!items || items.length === 0) {
        replyText = "Humare chefs menu prepare kar rahe hain.\nKripya thodi der mein wapas try karein!";
        interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Categories" } }] } };
      } else {
        replyText = ""; 
        interactive = createInteractiveMenu(items, "📜 Aaj ke Items", "Neeche tap karke item select karein 👇");
      }
      break;
    }
    case "SHOW_MENU": {
      const categories = await getAvailableCategoriesToday();
      if (!categories || categories.length === 0) { 
        replyText = "Humare chefs menu prepare kar rahe hain.\nKripya thodi der mein try karein!"; 
        break; 
      }
      
      const rows = categories.slice(0, 10).map(cat => {
        const icon = getCategoryIcon(cat.name);
        return { 
           id: `cat_${cat._id}`, 
           title: `${icon} ${cat.name}`.substring(0, 24), 
           description: "Tap karke items dekhein" 
        };
      });

      interactive = { type: "list", header: { type: "text", text: "🍽️ Hotel The Galaxy Menu" }, body: { text: "Neeche diye gaye button par click karke category select karein 👇" }, action: { button: "📋 Menu Dekhein", sections: [{ title: "Categories", rows: rows }] } };
      break;
    }
    case "SEARCH_ITEM": {
      const query = aiData?.search_query || inputText.trim();
      const results = await searchTodayRosterItems(query);
      if (!results || results.length === 0) {
        replyText = `Maaf kijiyega, aaj humare paas *${query}* se juda koi item nahi hai. 😔`;
        interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Pura Menu Dekhein" } }] } };
      } else {
        replyText = "";
        interactive = createInteractiveMenu(results, `🔍 Search: ${query.toUpperCase()}`, "Neeche tap karke item select karein 👇");
      }
      break;
    }
    case "SELECT_CATEGORY": {
      let categoryId = aiData?.categoryId; 
      let categoryItems = []; 
      let categoryName = aiData?.category_name || inputText;

      if (categoryId && categoryName.startsWith("cat_")) {
        const categories = await getCategories();
        const matchedCat = categories.find(c => String(c._id) === String(categoryId));
        if (matchedCat) { categoryName = matchedCat.name; } 
        else { categoryName = "Menu"; }
      } 
      else if (!categoryId && categoryName) {
        const searchName = categoryName.toLowerCase().trim();
        const categories = await getCategories();
        const matchedCat = categories.find(c => c.name.toLowerCase() === searchName || c.name.toLowerCase().includes(searchName) || searchName.includes(c.name.toLowerCase()));
        if (matchedCat) { categoryId = matchedCat._id; categoryName = matchedCat.name; }
      }

      if (categoryId) categoryItems = await getMenuByCategory(categoryId);
      
      if (!categoryItems || categoryItems.length === 0) {
        replyText = `Maaf kijiyega, aaj *${categoryName || "is category"}* mein koi item available nahi hai. 👨‍🍳`;
        interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Pura Menu Dekhein" } }] } };
      } else {
        replyText = ""; 
        interactive = createInteractiveMenu(categoryItems, `📜 ${categoryName || 'Menu'} Items`, "Neeche tap karke item select karein 👇");
      }
      break;
    }

    case "PROMPT_QUANTITY": {
      const itemName = aiData?.item_name || inputText.trim();
      if (!itemName) {
        replyText = "Error: Item nahi mila. Kripya menu se wapas select karein.";
        interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }] } };
        break;
      }
      
      pendingQuantityMemory[phone] = itemName;
      
      const qtyRows = Array.from({length: 10}, (_, i) => ({
        id: `qty_${i+1}`,
        title: `${i+1} Quantity`,
        description: `Add ${i+1} ${itemName.substring(0, 15)}...`
      }));

      replyText = `Aapne *${itemName}* select kiya hai.\n\nKripya neeche list par tap karke batayein ki aapko iski kitni quantity chahiye (1 se 10) 👇`;
      
      interactive = {
        type: "list",
        header: { type: "text", text: "🔢 Quantity Select Karein" },
        body: { text: replyText },
        action: {
          button: "🔢 Kitna Chahiye?",
          sections: [{ title: "Select Quantity", rows: qtyRows }]
        }
      };
      break;
    }

    case "HANDLE_QUANTITY_SELECTION": {
      const qty = aiData?.quantity || 1;
      const itemName = pendingQuantityMemory[phone];
      
      if (!itemName) {
        replyText = "Session expire ho gaya hai. Kripya menu se item wapas select karein.";
        interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu Dekhein" } }] } };
        break;
      }

      const itemsToAdd = [{ name: itemName, quantity: qty }];
      const { cart, messages, setting } = await addItemsToCart(phone, itemsToAdd);
      
      delete pendingQuantityMemory[phone];

      let cartSummary = cart.map(item => `▪️ ${item.quantity}x ${item.name} - ₹${item.total}`).join("\n");
      let subtotal = cart.reduce((sum, item) => sum + item.total, 0);
      let feedbackString = messages.join("\n"); 
      
      const dCharge = setting?.deliveryCharge || {};
      const isFree = dCharge.isFreeDelivery || subtotal >= (dCharge.freeDeliveryAbove || 500);
      let deliveryMsg = isFree ? "FREE! 🎉" : `₹${dCharge.baseFee || 30} (Based on distance)`;
      let freeMsg = dCharge.isFreeDelivery ? "Aaj completely FREE delivery hai!" : `(₹${dCharge.freeDeliveryAbove || 500} se upar free delivery!)`;
      
      replyText = `${feedbackString}\n\n🛒 *Aapka Cart:*\n${cartSummary}\n\n🧾 Subtotal: ₹${subtotal}\n🚚 Est. Delivery: ${deliveryMsg}\n*${freeMsg}*\n\nAur kuch chahiye ya checkout karein?`;
      interactive = { type: "button", body: { text: replyText }, action: { buttons: [ { type: "reply", reply: { id: "btn_add_more", title: "➕ Aur Add" } }, { type: "reply", reply: { id: "btn_checkout", title: "➡️ Checkout" } } ] } };
      break;
    }

    case "ADD_TO_CART": {
      const itemsToAdd = aiData?.extracted_items || [];
      if (itemsToAdd.length === 0) {
        replyText = "Kripya item ka pura naam aur quantity likhein.\n(Jaise: '1 Kadhai Paneer').";
      } else {
        const { cart, messages, setting } = await addItemsToCart(phone, itemsToAdd);
        let cartSummary = cart.map(item => `▪️ ${item.quantity}x ${item.name} - ₹${item.total}`).join("\n");
        let subtotal = cart.reduce((sum, item) => sum + item.total, 0);
        let feedbackString = messages.join("\n"); 
        
        const dCharge = setting?.deliveryCharge || {};
        const isFree = dCharge.isFreeDelivery || subtotal >= (dCharge.freeDeliveryAbove || 500);
        let deliveryMsg = isFree ? "FREE! 🎉" : `₹${dCharge.baseFee || 30} (Based on distance)`;
        let freeMsg = dCharge.isFreeDelivery ? "Aaj completely FREE delivery hai!" : `(₹${dCharge.freeDeliveryAbove || 500} se upar free delivery!)`;
        
        replyText = `${feedbackString}\n\n🛒 *Aapka Cart:*\n${cartSummary}\n\n🧾 Subtotal: ₹${subtotal}\n🚚 Est. Delivery: ${deliveryMsg}\n*${freeMsg}*\n\nAur kuch chahiye ya checkout karein?`;
        interactive = { type: "button", body: { text: replyText }, action: { buttons: [ { type: "reply", reply: { id: "btn_add_more", title: "➕ Aur Add" } }, { type: "reply", reply: { id: "btn_checkout", title: "➡️ Checkout" } } ] } };
      }
      break;
    }

    case "REMOVE_FROM_CART": {
      const itemsToRemove = aiData?.extracted_items || [];
      if (itemsToRemove.length === 0) {
        replyText = "Kripya item aur quantity clear batayein.\n(Jaise: 'Remove 1 Thali').";
        interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }] } };
      } else {
        const { cart, setting } = await removeItemsFromCart(phone, itemsToRemove);
        if (!cart || cart.length === 0) {
          replyText = "🗑️ Item remove ho gaya.\nAapka cart ab khali hai!";
          interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu Dekhein" } }] } };
        } else {
          let cartSummary = cart.map(item => `▪️ ${item.quantity}x ${item.name} - ₹${item.total}`).join("\n");
          let subtotal = cart.reduce((sum, item) => sum + item.total, 0);
          
          const dCharge = setting?.deliveryCharge || {};
          const isFree = dCharge.isFreeDelivery || subtotal >= (dCharge.freeDeliveryAbove || 500);
          let deliveryMsg = isFree ? "FREE! 🎉" : `₹${dCharge.baseFee || 30} (Based on distance)`;
          let freeMsg = dCharge.isFreeDelivery ? "Aaj completely FREE delivery hai!" : `(₹${dCharge.freeDeliveryAbove || 500} se upar free delivery!)`;
          
          replyText = `🗑️ Item remove kar diya gaya hai.\n\n🛒 *Updated Cart:*\n${cartSummary}\n\n🧾 Subtotal: ₹${subtotal}\n🚚 Est. Delivery: ${deliveryMsg}\n*${freeMsg}*\n\nAur kuch chahiye ya checkout karein?`;
          interactive = { type: "button", body: { text: replyText }, action: { buttons: [ { type: "reply", reply: { id: "btn_add_more", title: "➕ Aur Add" } }, { type: "reply", reply: { id: "btn_checkout", title: "➡️ Checkout" } } ] } };
        }
      }
      break;
    }

    case "CHECKOUT": {
      const addresses = await getUserAddresses(user._id);
      let addressPrompt = `📍 *Aapka order kahan deliver karna hai?*\n\nNeeche diye gaye option se select karein:`;
      
      if (addresses && addresses.length > 0) {
        const topAddresses = addresses.slice(0, 2); 
        let buttons = topAddresses.map((addr, idx) => {
          let uniqueTitle = `${idx + 1}. ${addr.label || 'Home'}`.substring(0, 20); 
          return { type: "reply", reply: { id: `addr_${addr._id}`, title: uniqueTitle } };
        });
        buttons.push({ type: "reply", reply: { id: "btn_new_address", title: "➕ Naya Address" } });

        let addressDetails = topAddresses.map((addr, idx) => `*${idx + 1}. ${addr.label || "Home"}*:\n${addr.street}, ${addr.landmark}`).join("\n\n");
        addressDetails += `\n\n*${topAddresses.length + 1}.* ➕ Ek Naya Address Jodein`;
        
        interactive = { type: "button", body: { text: `${addressPrompt}\n\n---\n\n${addressDetails}` }, action: { buttons } };
      } else { 
        replyText = "📍 *Naya Address*\n\nNeeche diye gaye *'Send Location'* button par click karke apni current location share karein.\n\nYa phir apna address type karke bhejein (Jaise: Area: Lalbagh, Landmark: PG College ke paas)."; 
        interactive = {
          type: "location_request_message",
          body: { text: replyText },
          action: { name: "send_location" }
        };
      }
      break;
    }
    case "PROMPT_NEW_ADDRESS": { 
      replyText = "📍 *Naya Address*\n\nNeeche diye gaye *'Send Location'* button par click karke apni current location share karein.\n\nYa phir apna address type karke bhejein (Jaise: Area: Lalbagh, Landmark: PG College ke paas)."; 
      interactive = {
        type: "location_request_message",
        body: { text: replyText },
        action: { name: "send_location" }
      };
      break; 
    }

    // 🔥 FIX: Address Confirmation Step
    case "PROVIDE_SHARED_LOCATION": {
      const loc = aiData?.location || state.location;
      if (!loc || !loc.lat || !loc.lng) {
        replyText = "Maaf kijiyega, hume aapki location theek se nahi mili. Kripya wapas share karein.";
        interactive = { type: "location_request_message", body: { text: replyText }, action: { name: "send_location" } };
        break;
      }
      const locationCheck = await verifyLocationByCoords(loc.lat, loc.lng);
      if (!locationCheck.status) {
        replyText = `😔 *Maaf Kijiyega!*\n\n${locationCheck.message}\n\nAap chahein toh apna pura address text mein type karke bhej sakte hain.`;
        break;
      }
      pendingLocationMemory[phone] = { lat: locationCheck.lat, lng: locationCheck.lng, area: locationCheck.formattedAddress, distanceKm: locationCheck.distanceKm };
      replyText = `✅ *Location Confirm Ho Gayi!*\n\n📍 Area: ${locationCheck.formattedAddress}\n\nKripya apna *Makaan/Flat Number* aur building ka naam likh kar bhejein (Jaise: Flat 101, Sai Kripa).`;
      break;
    }
    case "PROVIDE_HOUSE_NUMBER": {
      const houseNumber = aiData?.house_number || inputText.trim();
      const savedLoc = pendingLocationMemory[phone];
      if (!savedLoc) {
        replyText = "Session expire ho gaya hai. Kripya apni location wapas share karein.";
        break;
      }
      const finalAddress = { area: savedLoc.area, landmark: `House/Flat: ${houseNumber}` };
      const newAddr = await saveNewAddress(user._id, finalAddress, savedLoc.lat, savedLoc.lng);
      
      pendingLocationMemory[phone] = { confirmAddressId: newAddr._id, distanceKm: savedLoc.distanceKm, addressStr: `${houseNumber}, ${savedLoc.area}` };
      
      replyText = `📍 *Aapki Delivery Location:*\n${houseNumber}, ${savedLoc.area}\n\nKya yeh location bilkul theek hai?`;
      interactive = { type: "button", body: { text: replyText }, action: { buttons: [ { type: "reply", reply: { id: "btn_confirm_address_yes", title: "✅ Yes, Proceed" } }, { type: "reply", reply: { id: "btn_confirm_address_no", title: "Change Address" } } ] } };
      break;
    }
    case "PROVIDE_ADDRESS": {
      const extractedAddress = aiData?.address || { area: inputText, landmark: "" };
      const locationCheck = await verifyDeliveryLocation(extractedAddress.area, extractedAddress.landmark);
      if (!locationCheck.status) {
        replyText = `😔 *Maaf Kijiyega!*\n\n${locationCheck.message}\n\nAap chahein toh koi aur address try kar sakte hain.`;
        break; 
      }
      const newAddr = await saveNewAddress(user._id, extractedAddress, locationCheck.lat, locationCheck.lng);
      
      pendingLocationMemory[phone] = { confirmAddressId: newAddr._id, distanceKm: locationCheck.distanceKm, addressStr: `${extractedAddress.landmark} ${extractedAddress.area}` };
      
      replyText = `📍 *Aapki Delivery Location:*\n${extractedAddress.landmark} ${extractedAddress.area}\n\nKya yeh location bilkul theek hai?`;
      interactive = { type: "button", body: { text: replyText }, action: { buttons: [ { type: "reply", reply: { id: "btn_confirm_address_yes", title: "✅ Yes, Proceed" } }, { type: "reply", reply: { id: "btn_confirm_address_no", title: "Change Address" } } ] } };
      break;
    }
    case "SELECT_SAVED_ADDRESS": {
      let addressId = aiData?.addressId; 
      let addressStr = "Saved Address";
      if (!addressId) {
        const savedAddresses = await getUserAddresses(user._id);
        const topAddresses = savedAddresses.slice(0, 2);
        let selectedIdx = (aiData?.address_index || 1) - 1;
        if (inputText.toLowerCase().includes("home")) selectedIdx = 0; 
        if (selectedIdx >= 0 && selectedIdx < topAddresses.length) { 
            addressId = topAddresses[selectedIdx]._id.toString(); 
            addressStr = topAddresses[selectedIdx].street;
        } else { 
          replyText = "📍 *Naya Address*\n\nNeeche diye gaye *'Send Location'* button par click karke apni current location share karein.\n\nYa phir apna address type karke bhejein."; 
          userContextMemory[phone] = replyText; 
          return { ...state, replyText, interactive: { type: "location_request_message", body: { text: replyText }, action: { name: "send_location" } } }; 
        }
      } else {
        const selectedAddr = await getUserAddresses(user._id).then(addrs => addrs.find(a => a._id.toString() === addressId));
        if(selectedAddr) addressStr = selectedAddr.street;
      }
      
      pendingLocationMemory[phone] = { confirmAddressId: addressId, distanceKm: null, addressStr: addressStr };
      
      replyText = `📍 *Aapki Delivery Location:*\n${addressStr}\n\nKya yeh location bilkul theek hai?`;
      interactive = { type: "button", body: { text: replyText }, action: { buttons: [ { type: "reply", reply: { id: "btn_confirm_address_yes", title: "✅ Yes, Proceed" } }, { type: "reply", reply: { id: "btn_confirm_address_no", title: "Change Address" } } ] } };
      break;
    }

    // 🔥 FIX: Address Confirmation Resolution with GST display
    case "CONFIRM_ADDRESS_NO": {
       // Send them back to checkout address selection
       const addresses = await getUserAddresses(user._id);
       let addressPrompt = `📍 *Aapka order kahan deliver karna hai?*\n\nNeeche diye gaye option se select karein:`;
       
       if (addresses && addresses.length > 0) {
         const topAddresses = addresses.slice(0, 2); 
         let buttons = topAddresses.map((addr, idx) => {
           let uniqueTitle = `${idx + 1}. ${addr.label || 'Home'}`.substring(0, 20); 
           return { type: "reply", reply: { id: `addr_${addr._id}`, title: uniqueTitle } };
         });
         buttons.push({ type: "reply", reply: { id: "btn_new_address", title: "➕ Naya Address" } });
         interactive = { type: "button", body: { text: `${addressPrompt}` }, action: { buttons } };
       } else { 
         replyText = "📍 *Naya Address*\n\nNeeche diye gaye *'Send Location'* button par click karke apni current location share karein."; 
         interactive = { type: "location_request_message", body: { text: replyText }, action: { name: "send_location" } };
       }
       break;
    }
    case "CONFIRM_ADDRESS_YES": {
      const mem = pendingLocationMemory[phone];
      if (!mem || !mem.confirmAddressId) {
          replyText = "Session expire ho gaya hai. Kripya wapas checkout karein.";
          interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_checkout", title: "➡️ Checkout" } }] } };
          break;
      }
      
      session.addressId = mem.confirmAddressId; await session.save();
      const cartItems = session.cart || [];
      if(cartItems.length === 0) { replyText = "Aapka cart khali hai. Pehle menu se items add karein."; break; }

      const paymentData = await processBotOrderAndPayment(user._id, phone, cartItems, mem.confirmAddressId, mem.distanceKm);
      if (paymentData.success) {
        paymentAttemptsMemory[phone] = 0; 
        
        replyText = `✅ *Address Confirmed!*\n\n💳 *Bill Details:*\nSubtotal: ₹${paymentData.subtotal}\n🍲 Food GST: ₹${paymentData.foodGST}\n`;
        
        if (paymentData.isFreeDelivery) {
            replyText += `🚚 Delivery: FREE! 🎉\n`;
        } else {
            replyText += `🚚 Delivery Fee: ₹${paymentData.deliveryCharge}\n`;
            if (paymentData.deliveryGST > 0) replyText += `🛵 Delivery GST: ₹${paymentData.deliveryGST}\n`;
        }

        replyText += `\n💰 *Grand Total: ₹${paymentData.totalAmount}*\n\n*(Payment successful hote hi order confirm ho jayega!)*`;
        
        interactive = { type: "cta_url", body: { text: replyText }, action: { name: "cta_url", parameters: { display_text: `Pay ₹${paymentData.totalAmount}`, url: paymentData.paymentUrl } } };
        session.cart = []; await session.save();
        delete pendingLocationMemory[phone];
      } else { replyText = "Payment link banane mein issue aaya. Kripya thodi der baad try karein."; }
      break;
    }

    case "TRACK_ORDER": {
      const activeOrders = await getActiveOrdersToday(user._id);
      
      if (activeOrders && activeOrders.length > 0) {
        replyText = `📦 *Aapke Aaj Ke Active Orders:*\n\n`;
        let hasPending = false;
        let hasCancelable = false;
        
        activeOrders.forEach((order, index) => {
            const orderStatus = order.status ? order.status.toLowerCase() : "processing";
            const amount = order.totalAmount || order.pricing?.total || 0;
            
            replyText += `*${index + 1}. Order ID:* ${order.orderNumber || order._id}\n`;
            
            if (orderStatus === "pending" || order.paymentStatus === "pending") {
                replyText += `⏳ Status: *PAYMENT PENDING*\n`;
                replyText += `⚠️ Kripya ${order.expiresIn || 0} minute mein payment karein.\n`;
                hasPending = true;
            } else {
                replyText += `📊 Status: *${orderStatus.toUpperCase()}*\n`;
            }
            
            replyText += `💰 Amount: ₹${amount.toFixed(2)}\n`;
            
            if (order.items && order.items.length > 0) {
               const itemStr = order.items.map(i => `${i.quantity}x ${i.name}`).join(", ");
               replyText += `📝 Items: ${itemStr}\n`;
            }

            if (orderStatus !== "pending" && order.paymentStatus !== "pending") {
                if (["dispatched", "out_for_delivery"].includes(orderStatus) && order.rider) { 
                  replyText += `🛵 Rider: ${order.rider.name || "Executive"} (📞 ${order.rider.phone})\n`; 
                  const trackingUrl = `https://uat.hotelthegalaxy.in/track-order/${order._id}`;
                  replyText += `📍 *Track Here:* ${trackingUrl}\n`;
                } else { 
                  replyText += `👨‍🍳 Humare chefs preparation kar rahe hain.\n`; 
                }
            }
            replyText += `\n---\n\n`;
            
            const uncancelableStatuses = ["confirmed", "preparing", "dispatched", "out_for_delivery", "delivered"];
            if (!uncancelableStatuses.includes(orderStatus)) { 
                hasCancelable = true;
            }
        });

        let buttons = [{ type: "reply", reply: { id: "btn_add_more", title: "🍔 Aur Order Karein" } }];
        if (hasPending) {
           buttons.push({ type: "reply", reply: { id: "btn_pay_pending", title: "💳 Pay Pending" } });
        }
        if (hasCancelable && buttons.length < 3) { 
           buttons.push({ type: "reply", reply: { id: "btn_cancel_order", title: "❌ Cancel Order" } }); 
        }
        interactive = { type: "button", body: { text: replyText.trim() }, action: { buttons } };
      } else {
        replyText = "Aapka aaj ka koi active order nahi hai.";
        interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu Dekhein" } }] } };
      }
      break;
    }

    case "VIEW_PENDING_ORDERS": {
      const pendingOrders = await getPendingOrders(user._id);
      
      if (!pendingOrders || pendingOrders.length === 0) {
        replyText = "Aapka koi pending order nahi hai jiska payment bacha ho.";
        interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }] } };
      } else {
        replyText = "Kripya select karein aap kis pending order ka payment karna chahte hain 👇";
        
        const rows = pendingOrders.slice(0, 10).map((ord, idx) => {
            const itemsStr = ord.items.map(i => `${i.quantity}x ${i.name}`).join(", ");
            const ordAmount = ord.totalAmount || ord.pricing?.total || 0; 
            return {
                id: `pay_ord_${ord._id}`,
                title: `Order ${idx + 1} - ₹${ordAmount}`, 
                description: itemsStr.substring(0, 72)
            };
        });

        interactive = {
            type: "list",
            header: { type: "text", text: "💳 Pending Payments" },
            body: { text: replyText },
            action: {
                button: "🧾 Select Order",
                sections: [{ title: "Pending Orders", rows: rows }]
            }
        };
      }
      break;
    }

    case "PAY_SPECIFIC_ORDER": {
      const orderIdToPay = aiData?.order_id;
      const paymentUrl = await getPaymentLinkByOrderId(orderIdToPay);
      const orderDetails = await Order.findById(orderIdToPay).lean();

      if (!paymentUrl || !orderDetails || orderDetails.status !== "pending") {
          replyText = "Maaf kijiyega, yeh order expire ho chuka hai ya iska link invalid hai. Kripya naya order banayein.";
          interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }] } };
      } else {
          const ordAmount = orderDetails.totalAmount || orderDetails.pricing?.total || 0;
          replyText = `🧾 *Order Payment*\n\nOrder ID: ${orderDetails.orderNumber || orderDetails._id}\nAmount: ₹${ordAmount}\n\nNeeche diye gaye link par click karke payment complete karein:`;
          interactive = { 
              type: "cta_url", 
              body: { text: replyText }, 
              action: { name: "cta_url", parameters: { display_text: `Pay ₹${ordAmount}`, url: paymentUrl } } 
          };
      }
      break;
    }

    case "CANCEL_ORDER": {
      const cancelledOrder = await cancelOrder(user._id);
      if (cancelledOrder) { 
        replyText = `✅ *Order Cancelled*\n\nAapka order cancel kar diya gaya hai.`; 
      } else { 
        replyText = `❌ *Cancel Nahi Ho Sakta*\n\nMaaf kijiyega, ya toh order active nahi hai, ya phir khana ban chuka hai.`; 
      }
      interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }] } };
      break;
    }
    case "COMPLETE_ORDER": {
      const paymentCheck = await checkLatestPaymentStatus(user._id);
      
      if (paymentCheck.isRejected) {
        paymentAttemptsMemory[phone] = 0; 
        replyText = `❌ *Order Cancelled*\n\n5 minute ke andar payment nahi aayi isliye order cancel ho gaya hai.\nKripya Menu se naya order place karein.`;
        interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }] } };
        break; 
      }

      if (!paymentCheck.found) { 
        replyText = "Mujhe aapka koi pending order nahi mila.\nNaya order place karein."; 
        interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }] } }; 
        break; 
      }

      if (paymentCheck.isPaid) {
        paymentAttemptsMemory[phone] = 0; 
        replyText = `🎉 *Payment Confirm Ho Gaya!*\n\nOrder ID: *${paymentCheck.orderNumber}*\n\nHumare chefs ne preparation start kar di hai! 👨‍🍳🔥`;
        interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_track", title: "📦 Track Order" } }] } };
      } else {
        let attempts = (paymentAttemptsMemory[phone] || 0) + 1; paymentAttemptsMemory[phone] = attempts; 
        if (attempts >= 3) {
          await cancelOrder(user._id); paymentAttemptsMemory[phone] = 0; 
          replyText = `❌ *Order Cancelled*\n\n3 attempts ke baad bhi payment receive nahi hua.\nSecurity reason se order cancel ho gaya hai.`;
          interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }] } };
        } else {
          replyText = `⚠️ *Payment Pending*\n\nAbhi tak payment system mein nahi aayi hai. *(Attempt ${attempts}/3)*\n\nKripya neeche button se pay karein, aur fir "paid" type karein.`;
          
          if (paymentCheck.paymentUrl) {
            interactive = { 
                type: "cta_url", 
                body: { text: replyText }, 
                action: { name: "cta_url", parameters: { display_text: `Pay ₹${(paymentCheck.totalAmount || 0).toFixed(2)}`, url: paymentCheck.paymentUrl } } 
            };
          } else {
             interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }] } };
          }
        }
      }
      break;
    }
    case "ORDER_STATS": {
      const stats = await getUserOrderStats(user._id);
      const recentOrders = await Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(5).lean();

      if (stats && stats.totalOrders > 0) { 
        replyText = `📜 *Aapki Order History*\n\n🛍️ Total Orders: *${stats.totalOrders}*\n💎 Total Spent: *₹${stats.totalSpent.toFixed(2)}*\n\n*🕒 Pichle 5 Orders:*\n`;
        recentOrders.forEach((o, i) => {
           const date = new Date(o.createdAt).toLocaleDateString("en-IN");
           const itemsStr = o.items.map(it => `${it.quantity}x ${it.name}`).join(", ");
           const ordAmt = o.totalAmount || o.pricing?.total || 0;
           replyText += `${i+1}. *${date}* - ₹${ordAmt.toFixed(2)} (${o.status.toUpperCase()})\n   📝 _${itemsStr}_\n\n`;
        });
      } else { 
        replyText = "Aapne abhi tak koi order place nahi kiya hai."; 
      }
      interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }] } };
      break;
    }
    default: {
      replyText = "Maaf kijiyega, main samajh nahi paya.\nMain aapki kya madad kar sakta hoon?";
      interactive = { type: "button", body: { text: replyText }, action: { buttons: [{ type: "reply", reply: { id: "btn_menu", title: "🍔 Menu" } }, { type: "reply", reply: { id: "btn_track", title: "📦 Track" } }, { type: "reply", reply: { id: "btn_help", title: "ℹ️ Help" } }] } };
    }
  }

  const finalBotTextToSave = interactive ? (interactive.body ? interactive.body.text : replyText) : replyText;
  userContextMemory[phone] = finalBotTextToSave;
  
  return { ...state, replyText, interactive }; 
}

function buildOrderGraph() {
  const graph = new StateGraph({
    channels: {
      phone: { value: (old, n) => n ?? old, default: () => "" },
      inputText: { value: (old, n) => n ?? old, default: () => "" },
      location: { value: (old, n) => n ?? old, default: () => null }, 
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