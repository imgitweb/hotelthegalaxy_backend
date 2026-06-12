const axios = require("axios");
require("dotenv").config(); 

// History tracking ke liye models import karein
const WhatsAppMessage = require("../../models/whatsaap/WhatsAppMessage");
const WhatsAppConversation = require("../../models/whatsaap/WhatsAppConversation");

// 🔥 Helper Function: Outgoing message ko silently DB mein save karne ke liye
const saveOutgoingMessageSilent = async (to, text, messageId, type, templateName = null) => {
  try {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    
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

    await WhatsAppMessage.create({
      message_id: messageId,
      status: "sent",
      conversation_id: conversation._id,
      sender_id: phoneId,
      receiver_id: to,
      text: text,
      is_from_me: true,
      is_read: true,
      message_type: type,
      template_name: templateName
    });

    console.log(`✉️ Outgoing message (${type}) saved to history for: ${to}`);
  } catch (dbErr) {
    console.error("❌ Failed to save outgoing message to database:", dbErr.message);
  }
};

async function sendAuthTemplate(phoneNumber , otp) {
  try {
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
    const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

    if (!TOKEN) throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
    if (!PHONE_ID) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
    if (!phoneNumber) throw new Error("Missing recipient phone number");

    // ✅ PHONE NUMBER FORMATTING LOGIC
    // 1. Remove any non-numeric characters (like '+', '-', ' ')
    let formattedPhone = String(phoneNumber).replace(/\D/g, "");
    
    // 2. Agar 10 digit ka hai toh aage '91' laga do
    if (formattedPhone.length === 10) {
      formattedPhone = "91" + formattedPhone;
    }
    // (Agar pehle se 91 laga hai aur length 12 hai, toh wo yahan skip ho jayega aur theek rahega)
    
    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: formattedPhone, // Use formatted phone number here
      type: "template",
      template: {
        name: "hotel_galaxy_otp", // Ensure this exactly matches Meta Manager
        language: {
          code: "en_IN" 
        },
        components: [
          // ✅ 1. BODY PARAMETER (Maps to {{1}} in text)
          {
            type: "body",
            parameters: [
              { 
                type: "text", 
                text: String(otp) 
              }
            ]
          },
          // ✅ 2. BUTTON PARAMETER (Copy Code / Dynamic URL)
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [
              { 
                type: "text", 
                text: String(otp) // Maps to the dynamic part of the button (e.g., Copy code {{1}})
              }
            ]
          }
        ]
      }
    };

    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    console.log(`✅ Auth Template sent successfully to ${formattedPhone}`);

    // ✅ FIX: Safely extract ID using optional chaining
    const msgId = res.data?.messages?.[0]?.id;
    const fallbackText = `[OTP Template Sent] OTP: ${otp}`;
    
    // ✅ Save to Database without awaiting (non-blocking)
    saveOutgoingMessageSilent(formattedPhone, fallbackText, msgId, "template", "hotel_galaxy_otp");

    return { 
        success: true, 
        otp: otp, // OTP wapas bhej rahe hain database check ke liye
        messageId: msgId 
    };

  } catch (error) {
    console.error(
      "❌ WhatsApp Template Error:",
      JSON.stringify(error.response?.data || error.message, null, 2)
    );
    return { 
        success: false, 
        error: error.response?.data || error.message 
    };
  }
}

module.exports = { sendAuthTemplate };





// const axios = require("axios");
// require("dotenv").config(); 

// async function sendAuthTemplate(phoneNumber , otp) {
//   try {
//     const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
//     const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
//     const API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

//     if (!TOKEN) throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
//     if (!PHONE_ID) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
//     if (!phoneNumber) throw new Error("Missing recipient phone number");

//     // ✅ Generate 6-digit OTP as a String
//     // const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
//     const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/messages`;

//     const payload = {
//       messaging_product: "whatsapp",
//       to: phoneNumber, 
//       type: "template",
//       template: {
//         name: "hotel_galaxy_otp", // Ensure this exactly matches Meta Manager
//         language: {
//           code: "en_IN" 
//         },
//         components: [
//           // ✅ 1. BODY PARAMETER (Maps to {{1}} in text)
//           {
//             type: "body",
//             parameters: [
//               { 
//                 type: "text", 
//                 text: otp 
//               }
//             ]
//           },
//           // ✅ 2. BUTTON PARAMETER (Copy Code / Dynamic URL)
//           // ⚠️ DHYAN DEIN: Ise sirf tabhi rakhein agar aapke Meta approved template 
//           // mein ek dynamic button hai. Agar button static hai, toh is array object ko hata dein.
//           {
//             type: "button",
//             sub_type: "url",
//             index: "0",
//             parameters: [
//               { 
//                 type: "text", 
//                 text: otp // Maps to the dynamic part of the button (e.g., Copy code {{1}})
//               }
//             ]
//           }
//         ]
//       }
//     };

//     const res = await axios.post(url, payload, {
//       headers: {
//         Authorization: `Bearer ${TOKEN}`,
//         "Content-Type": "application/json"
//       }
//     });

//     console.log(`✅ Auth Template sent successfully to ${phoneNumber}`);

//     return { 
//         success: true, 
//         otp: otp, // OTP wapas bhej rahe hain database check ke liye
//         messageId: res.data.messages[0].id 
//     };

//   } catch (error) {
//     console.error(
//       "❌ WhatsApp Template Error:",
//       JSON.stringify(error.response?.data || error.message, null, 2)
//     );
//     return { 
//         success: false, 
//         error: error.response?.data || error.message 
//     };
//   }
// }

// module.exports = { sendAuthTemplate };