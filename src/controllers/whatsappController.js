const { extractIncomingMessage } = require("../utils/whatsaap/parseWhatsApp");
const {runLangGraph} = require("../langraph/services/langgraphService");

const verifyWebhook = (req, res) => {

  console.log("Webhook verification triggered");
  console.log("$$$ query",req.query)
  const mode = req.query["hub_mode"];
  const token = req.query["hub_verify_token"];
  const challenge = req.query["hub_challenge"];

  console.log("Mode:", mode);
  console.log("Token from Meta:", token);
  console.log("Token from ENV:", process.env.VERIFY_TOKEN);

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("Webhook verified successfully ✅");
    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed ❌");
  return res.sendStatus(403);
};





const receiveMessage = async (req, res) => {
  try {
    console.log(".................................................................... hit")
    // ✅ WhatsApp ko turant ACK
    res.sendStatus(200);

    console.log("✅ Webhook triggered");
    console.log(JSON.stringify(req.body, null, 2));

    const incoming = extractIncomingMessage(req.body);
    console.log("✅ Extracted incoming:", incoming);

    if (!incoming || !incoming.text) return;

    // ✅ PROPER MAPPING HERE
    await runLangGraph({
      phone: incoming.from,
      text: incoming.text,
    });
  } catch (err) {
    console.error("❌ receiveMessage error:", err.response?.data || err.message);
  }
};

module.exports = { verifyWebhook, receiveMessage };
