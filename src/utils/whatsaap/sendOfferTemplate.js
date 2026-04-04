const axios = require("axios");
require("dotenv").config(); 


async function sendOfferTemplate(phoneNumber, offerData) {
  try {
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
    const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const API_VERSION = process.env.WHATSAPP_API_VERSION || "v17.0"; // v17.0 ya v23.0 jo bhi aap use kar rahe ho

    if (!TOKEN) throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
    if (!PHONE_ID) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
    if (!phoneNumber) throw new Error("Missing recipient phone number");
    if (!offerData.imageUrl) throw new Error("Missing Offer Image URL");

    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: phoneNumber,
      type: "template",
      template: {
        name: "new_special_offer", // ⚠️ Ensure this exactly matches your Meta approved template name
        language: {
          code: "en" // ⚠️ Change to "en_IN" if your template was approved in English (India)
        },
        components: [
          // ✅ 1. HEADER PARAMETER (Maps to the Image)
          {
            type: "header",
            parameters: [
              {
                type: "image",
                image: {
                  link: offerData.imageUrl // Cloudinary URL
                }
              }
            ]
          },
          // ✅ 2. BODY PARAMETERS (Maps to {{1}}, {{2}}, {{3}}, {{4}}, {{5}})
          {
            type: "body",
            parameters: [
              { type: "text", text: offerData.userName || "Guest" },   // {{1}}
              { type: "text", text: offerData.offerName },             // {{2}}
              { type: "text", text: offerData.discountText },          // {{3}}
              { type: "text", text: offerData.startDate },             // {{4}}
              { type: "text", text: offerData.endDate }                // {{5}}
            ]
          }
          // Note: Agar aapke button URL mein koi dynamic id/code nahi hai (static link hai), 
          // toh button component yahan bhejne ki zarurat nahi hai. Meta usko apne aap handle kar lega.
        ]
      }
    };

    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    console.log(`✅ Offer Template sent successfully to ${phoneNumber}`);

    return { 
        success: true, 
        messageId: res.data.messages[0].id 
    };

  } catch (error) {
    console.error(
      `❌ WhatsApp Offer Template Error for ${phoneNumber}:`,
      JSON.stringify(error.response?.data || error.message, null, 2)
    );
    return { 
        success: false, 
        error: error.response?.data || error.message 
    };
  }
}




module.exports = { sendOfferTemplate };