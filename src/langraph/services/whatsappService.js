const axios = require("axios");

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
    return { success: true, data: response.data };
  } catch (error) {
    console.error("❌ Error sending interactive message:", error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}


module.exports = { sendTextMessage, sendInteractiveMessage };