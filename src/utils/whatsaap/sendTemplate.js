const axios = require("axios");
require("dotenv").config();

const API_VERSION = "v23.0";
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

async function sendWhatsAppMessage({
  to,
  type = "text",
  text,
  templateName,
  language = "en_US",
  parameters = [] // ✅ add this
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
cd  
  // 👉 Text message
  if (type === "text") {
    if (!text) throw new Error("Text body is required for text messages");

    payload.type = "text";
    payload.text = { body: text };
  }

  // 👉 Template message
  else if (type === "template") {
    if (!templateName) throw new Error("templateName is required");

    payload.type = "template";
    payload.template = {
      name: templateName,
      language: { code: language },
      components: [
        {
          type: "body",
          parameters: parameters.map((param) => ({
            type: "text",
            text: param
          }))
        }
      ]
    };
  }

  else {
    throw new Error(`Unsupported message type: ${type}`);
  }

  try {
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    console.log("✅ WhatsApp API Response:", res.data);
    return res.data;

  } catch (error) {
    console.error(
      "❌ WhatsApp Error:",
      error.response?.data || error.message
    );
    throw error;
  }
}

module.exports = { sendWhatsAppMessage };