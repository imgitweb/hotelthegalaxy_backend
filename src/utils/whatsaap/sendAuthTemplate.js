const axios = require("axios");
require("dotenv").config(); 

async function sendAuthTemplate(phoneNumber , otp) {
  try {
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
    const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

    if (!TOKEN) throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
    if (!PHONE_ID) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
    if (!phoneNumber) throw new Error("Missing recipient phone number");

    // ✅ Generate 6-digit OTP as a String
    // const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: phoneNumber, 
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
                text: otp 
              }
            ]
          },
          // ✅ 2. BUTTON PARAMETER (Copy Code / Dynamic URL)
          // ⚠️ DHYAN DEIN: Ise sirf tabhi rakhein agar aapke Meta approved template 
          // mein ek dynamic button hai. Agar button static hai, toh is array object ko hata dein.
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [
              { 
                type: "text", 
                text: otp // Maps to the dynamic part of the button (e.g., Copy code {{1}})
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

    console.log(`✅ Auth Template sent successfully to ${phoneNumber}`);

    return { 
        success: true, 
        otp: otp, // OTP wapas bhej rahe hain database check ke liye
        messageId: res.data.messages[0].id 
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