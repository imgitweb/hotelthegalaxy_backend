const { buildOrderGraph } = require("../graph/orderGraph");
const { sendTextMessage } = require("./whatsappService");

const graph = buildOrderGraph();

function normalizePhone(phone) {
  if (!phone) return null;
  return String(phone).replace(/[^\d]/g, "");
}

async function runLangGraph({ phone, text, mode = "whatsapp" }) {
  console.log("Running LangGraph with:", { phone, text, mode });

  const output = await graph.invoke({
    phone,
    inputText: text,
  });

  console.log("✅ LangGraph output:", output);

  // ✅ ONLY send WhatsApp message in whatsapp mode
  if (mode === "whatsapp" && output?.replyText) {
    const waPhone = normalizePhone(phone);
    if (!waPhone || waPhone.length < 10) {
      console.log("⚠️ Skipping WhatsApp send, invalid phone:", phone);
    } else {
      await sendTextMessage(waPhone, output.replyText);
    }
  }

  // ✅ Always return output for web / API
  return output;
}

module.exports = { runLangGraph };
