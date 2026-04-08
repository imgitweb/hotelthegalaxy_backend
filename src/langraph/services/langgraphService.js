const { buildOrderGraph } = require("../graph/orderGraph");
const { sendTextMessage, sendInteractiveMessage } = require("./whatsappService");

const graph = buildOrderGraph();

function normalizePhone(phone) {
  if (!phone) return null;
  if (phone.startsWith("web_")) return phone; 
  return String(phone).replace(/[^\d]/g, "");
}

// 🔥 FIX: Yahan parameters mein 'location' add kiya gaya hai
async function runLangGraph({ phone, text, location, channel = "whatsapp" }) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return;

  try {
    const output = await graph.invoke({
      phone: normalizedPhone,
      inputText: text,
      // 🔥 FIX: 'extractedMsg' hata kar 'location' variable use kiya
      location: location || null, 
    });

    console.log(`✅ LangGraph output for ${channel}:`, output);

    if (channel === "whatsapp") {
      try {
        // 🔥 Agar state mein interactive data hai toh button/list bhejo
        if (output.interactive) {
          await sendInteractiveMessage(normalizedPhone, output.interactive);
        } else if (output.replyText) {
          await sendTextMessage(normalizedPhone, output.replyText);
        }
      } catch (sendError) {
        console.error("❌ Failed to send WhatsApp message", sendError);
      }
    }

    return output; 
  } catch (graphError) {
    console.error("❌ LangGraph execution failed:", graphError);
    throw graphError; 
  }
}

module.exports = { runLangGraph };