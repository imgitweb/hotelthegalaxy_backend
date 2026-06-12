const axios = require("axios");
require("dotenv").config();

// History tracking ke liye models import karein
const WhatsAppMessage = require("../../models/whatsaap/WhatsAppMessage");
const WhatsAppConversation = require("../../models/whatsaap/WhatsAppConversation");

const API_VERSION = "v23.0";
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// 🔥 Helper Function: Outgoing message ko silently DB mein save karne ke liye
const saveOutgoingMessageSilent = async (to, text, messageId, type, templateName = null, mediaUrl = null) => {
  try {
    const conversation = await WhatsAppConversation.findOneAndUpdate(
      { phone_number_id: PHONE_ID, customer_phone: to },
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

    await WhatsAppMessage.create({
      message_id: messageId,
      status: "sent", // Starting status for webhook tracking
      conversation_id: conversation._id,
      sender_id: PHONE_ID,
      receiver_id: to,
      text: text,
      is_from_me: true,
      is_read: true,
      message_type: type,
      template_name: templateName, // Agar template hai toh naam save hoga
      media_url: mediaUrl          // Image URL agar bheji gayi hai
    });

    console.log(`✉️ Outgoing message (${type}) saved to history for: ${to}`);
  } catch (dbErr) {
    console.error("❌ Failed to save outgoing message to database:", dbErr.message);
  }
};

async function sendWhatsAppMessage({
  to,
  type = "text",
  text,
  templateName,
  language = "en_US",
  parameters = [], 
  headerImageUrl = null // 🔥 NEW: Added support for Header Image
}) {
  if (!TOKEN) throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
  if (!PHONE_ID) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
  if (!to) throw new Error("Recipient number (to) is required");

  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/messages`;

  let payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to
  };

  // 👉 Text message
  if (type === "text") {
    if (!text) throw new Error("Text body is required for text messages");

    payload.type = "text";
    payload.text = { body: text };
  }

  // 👉 Template message
  else if (type === "template") {
    if (!templateName) throw new Error("templateName is required");

    let components = [
      {
        type: "body",
        parameters: parameters.map((param) => ({
          type: "text",
          text: param || "User" // Fallback if parameter is empty
        }))
      }
    ];

    // 🔥 If an image URL is provided, attach it as a header component
    if (headerImageUrl) {
      components.push({
        type: "header",
        parameters: [
          {
            type: "image",
            image: { link: headerImageUrl }
          }
        ]
      });
    }

    payload.type = "template";
    payload.template = {
      name: templateName,
      language: { code: language },
      components: components
    };
  } else {
    throw new Error(`Unsupported message type: ${type}`);
  }

  try {
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    console.log(`✅ WhatsApp sent to ${to}`);

    // ✅ FIX: Safely extract ID using optional chaining
    const msgId = res.data?.messages?.[0]?.id;
    
    // UI ke liye fallback text decide karna
    let savedText = text || "";
    if (type === "template") {
      // Template ke case me exact text generate karna mushkil hai yahan, isliye fallback text use kar rahe hain
      savedText = `[Template Sent: ${templateName}]`; 
    }

    // ✅ Save to Database without awaiting (non-blocking)
    saveOutgoingMessageSilent(to, savedText, msgId, type, templateName, headerImageUrl);

    return res.data;

  } catch (error) {
    console.error(
      `❌ WhatsApp Error for ${to}:`,
      error.response?.data?.error?.message || error.message
    );
    throw error;
  }
}

module.exports = { sendWhatsAppMessage };


// const axios = require("axios");
// require("dotenv").config();

// const API_VERSION = "v23.0";
// const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
// const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// async function sendWhatsAppMessage({
//   to,
//   type = "text",
//   text,
//   templateName,
//   language = "en_US",
//   parameters = [], 
//   headerImageUrl = null // 🔥 NEW: Added support for Header Image
// }) {
//   if (!TOKEN) throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
//   if (!PHONE_ID) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
//   if (!to) throw new Error("Recipient number (to) is required");

//   const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/messages`;

//   let payload = {
//     messaging_product: "whatsapp",
//     recipient_type: "individual",
//     to
//   };

//   // 👉 Text message
//   if (type === "text") {
//     if (!text) throw new Error("Text body is required for text messages");

//     payload.type = "text";
//     payload.text = { body: text };
//   }

//   // 👉 Template message
//   else if (type === "template") {
//     if (!templateName) throw new Error("templateName is required");

//     let components = [
//       {
//         type: "body",
//         parameters: parameters.map((param) => ({
//           type: "text",
//           text: param || "User" // Fallback if parameter is empty
//         }))
//       }
//     ];

//     // 🔥 If an image URL is provided, attach it as a header component
//     if (headerImageUrl) {
//       components.push({
//         type: "header",
//         parameters: [
//           {
//             type: "image",
//             image: { link: headerImageUrl }
//           }
//         ]
//       });
//     }

//     payload.type = "template";
//     payload.template = {
//       name: templateName,
//       language: { code: language },
//       components: components
//     };
//   } else {
//     throw new Error(`Unsupported message type: ${type}`);
//   }

//   try {
//     const res = await axios.post(url, payload, {
//       headers: {
//         Authorization: `Bearer ${TOKEN}`,
//         "Content-Type": "application/json"
//       }
//     });

//     console.log(`✅ WhatsApp sent to ${to}`);
//     return res.data;

//   } catch (error) {
//     console.error(
//       `❌ WhatsApp Error for ${to}:`,
//       error.response?.data?.error?.message || error.message
//     );
//     throw error;
//   }
// }

// module.exports = { sendWhatsAppMessage };