const { buildOrderGraph } = require("../graph/orderGraph");
const { sendTextMessage } = require("./whatsappService");

const graph = buildOrderGraph();

function normalizePhone(phone) {
  if (!phone) return null;
  // If it's a web user, let the "web_" prefix pass through
  if (phone.startsWith("web_")) return phone; 
  return String(phone).replace(/[^\d]/g, "");
}


async function runLangGraph({ phone, text, channel = "whatsapp" }) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return;

  try {
    const output = await graph.invoke({
      phone: normalizedPhone,
      inputText: text,
    });

    console.log(`✅ LangGraph output for ${channel}:`, output);

    // 🔥 ONLY send to WhatsApp if the channel is "whatsapp"
    if (output?.replyText && channel === "whatsapp") {
      try {
        await sendTextMessage(normalizedPhone, output.replyText, output.buttons);
      } catch (sendError) {
        console.error("❌ Failed to send WhatsApp message");
      }
    }

    // Always return output so the Web API can use it
    return output; 
  } catch (graphError) {
    console.error("❌ LangGraph execution failed:", graphError);
    throw graphError; 
  }
}

module.exports = { runLangGraph };