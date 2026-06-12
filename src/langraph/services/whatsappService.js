const axios = require("axios");

// History tracking ke liye models import karein
const WhatsAppMessage = require("../../models/whatsaap/WhatsAppMessage");
const WhatsAppConversation = require("../../models/whatsaap/WhatsAppConversation");

// Outgoing Bot/Admin messages ko silently background mein save karne ka helper
const saveOutgoingMessageSilent = async (to, text, messageId, type = "text") => {
  try {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    // 1. Conversation find ya upsert karo (Fix: returnDocument use kiya deprecation se bachne ke liye)
    const conversation = await WhatsAppConversation.findOneAndUpdate(
      { phone_number_id: phoneId, customer_phone: to },
      {
        $set: { 
          last_message: text, 
          last_message_time: new Date() 
        },
        $setOnInsert: { 
          customer_name: "Customer", 
          ai_enabled: true 
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    // 2. Individual message entry create karo
    await WhatsAppMessage.create({
      message_id: messageId,
      status: "sent",
      conversation_id: conversation._id,
      sender_id: phoneId,
      receiver_id: to,
      text: text,
      is_from_me: true, // Bot ya admin ka message hai
      is_read: true,
      message_type: type
    });

    console.log(`✉️ Outgoing message (${type}) saved to history for: ${to}`);
  } catch (dbErr) {
    // Agar DB operation fail ho, toh sirf console par error dikhe, main flow na tute
    console.error("❌ Failed to save outgoing message to database:", dbErr.message);
  }
};

async function sendTextMessage(to, text) {
  const url = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    const response = await axios.post(url, {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    // Success hone par Meta Message ID nikal kar silently database mein save karo
    const msgId = response.data?.messages?.[0]?.id;
    
    // background execution bina await ke taaki speed slow na ho
    saveOutgoingMessageSilent(to, text, msgId, "text");

    return { success: true, data: response.data };
  } catch (error) {
    console.error("❌ Error sending text message:", error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

async function sendInteractiveMessage(to, interactiveData) {
  const url = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    const response = await axios.post(url, {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: interactiveData,
    }, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    // Success hone par Meta Message ID nikal kar interactive text parse karke save karo
    const msgId = response.data?.messages?.[0]?.id;
    const fallbackText = interactiveData?.body?.text || "Interactive Menu / Button Clicked";
    
    // background execution bina await ke taaki speed slow na ho
    saveOutgoingMessageSilent(to, fallbackText, msgId, "interactive");

    return { success: true, data: response.data };
  } catch (error) {
    console.error("❌ Error sending interactive message:", error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

module.exports = { sendTextMessage, sendInteractiveMessage };





// const axios = require("axios");

// async function sendTextMessage(to, text) {
//   const url = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
//   try {
//     const response = await axios.post(url, {
//       messaging_product: "whatsapp",
//       to,
//       type: "text",
//       text: { body: text },
//     }, {
//       headers: {
//         Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
//         "Content-Type": "application/json",
//       },
//     });
//     return { success: true, data: response.data };
//   } catch (error) {
//     console.error("❌ Error sending text message:", error.response?.data || error.message);
//     return { success: false, error: error.response?.data || error.message };
//   }
// }


// async function sendInteractiveMessage(to, interactiveData) {
//   const url = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
//   try {
//     const response = await axios.post(url, {
//       messaging_product: "whatsapp",
//       to,
//       type: "interactive",
//       interactive: interactiveData,
//     }, {
//       headers: {
//         Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
//         "Content-Type": "application/json",
//       },
//     });
//     return { success: true, data: response.data };
//   } catch (error) {
//     console.error("❌ Error sending interactive message:", error.response?.data || error.message);
//     return { success: false, error: error.response?.data || error.message };
//   }
// }


// module.exports = { sendTextMessage, sendInteractiveMessage };