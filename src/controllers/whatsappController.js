const { extractIncomingMessage } = require("../utils/whatsaap/parseWhatsApp");
const { runLangGraph } = require("../langraph/services/langgraphService");

// Data models import for saving history
const WhatsAppMessage = require("../models/whatsaap/WhatsAppMessage");
const WhatsAppConversation = require("../models/whatsaap/WhatsAppConversation");

// Apne .env variable ko configure kar lena
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

const verifyWebhook = (req, res) => {
  console.log("Webhook verification triggered");
  console.log("$$$ query", req.query);
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
    console.log(".................................................................... hit");
    // ✅ WhatsApp ko turant ACK do taaki retry timeouts na aayen
    res.sendStatus(200);

    console.log("✅ Webhook triggered");

    const body = req.body;

    // ==========================================
    // 1. HANDLE STATUS UPDATES (Sent, Delivered, Read, Failed)
    // ==========================================
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const statuses = changes?.value?.statuses;

    if (statuses && statuses.length > 0) {
      for (const status of statuses) {
        try {
          const wamid = status.id; // The Meta Message ID
          const statusText = status.status; // sent, delivered, read, failed
          const errorInfo = status.errors ? status.errors[0]?.message : null;

          // Find the exact message and update its status
          await WhatsAppMessage.findOneAndUpdate(
            { message_id: wamid },
            { 
              status: statusText,
              ...(errorInfo ? { "meta_data.error": errorInfo } : {}) 
            }
          );
          console.log(`✅ Message Status Updated: ${wamid} is now ${statusText}`);
        } catch (statusErr) {
          console.error("❌ Error updating message status:", statusErr.message);
        }
      }
      return; // If it was just a status update, return early
    }

    // ==========================================
    // 2. EXTRACT INCOMING MESSAGE
    // ==========================================
    const incoming = extractIncomingMessage(body);
    if (!incoming) return; // Ignore if no message format recognized
    console.log("✅ Extracted incoming:", incoming);

    let aiEnabledForUser = true; // Default flag

    // ==========================================
    // 3. SAVE INCOMING MESSAGE & CHECK AI STATUS
    // ==========================================
    if (incoming.from) {
      try {
        const phone = incoming.from;
        const text = incoming.text || (incoming.location ? "📍 Location Shared" : "Unsupported Media");

        // Find or create conversation. Ek user ka ek hi conversation hoga.
        const conversation = await WhatsAppConversation.findOneAndUpdate(
          { phone_number_id: PHONE_ID, customer_phone: phone },
          {
            $set: { last_message: text, last_message_time: new Date() },
            $setOnInsert: { customer_name: incoming.name || phone, ai_enabled: true } // Default AI true for new users
          },
          { upsert: true, returnDocument: 'after' } // returnDocument after taaki updated doc mile
        );

        // ✅ Check if AI is explicitly turned off for this user in DB
        if (conversation && conversation.ai_enabled === false) {
          aiEnabledForUser = false;
        }

        // Save the incoming user message
        await WhatsAppMessage.create({
          message_id: incoming.id,
          status: "delivered", // Since it reached our backend, it's delivered to us
          conversation_id: conversation._id,
          sender_id: phone,
          receiver_id: PHONE_ID,
          text: text,
          is_from_me: false, // Came from the customer
          is_read: true,     // System read it
          message_type: incoming.type || "text",
          meta_data: incoming.location ? { location: incoming.location } : {}
        });

      } catch (saveErr) {
        console.error("❌ Failed to save INCOMING message to database:", saveErr.message);
      }
    }

    // ==========================================
    // 4. RUN LANGGRAPH (Only if AI is enabled)
    // ==========================================
    if (!incoming || !incoming.text) return;

    if (aiEnabledForUser) {
      console.log(`🤖 AI is ENABLED for ${incoming.from}. Running LangGraph...`);
      await runLangGraph({
        phone: incoming.from,
        text: incoming.text,
        location: incoming.location,
      });
    } else {
      console.log(`⏸️ AI is DISABLED for ${incoming.from}. Skipping LangGraph execution.`);
    }

  } catch (err) {
    // Ye catch req.body issue ke liye hai, 200 pehle hi bhej diya tha.
    console.error("❌ receiveMessage error:", err.response?.data || err.message);
  }
};

module.exports = { verifyWebhook, receiveMessage };














// const { extractIncomingMessage } = require("../utils/whatsaap/parseWhatsApp");
// const {runLangGraph} = require("../langraph/services/langgraphService");

// const verifyWebhook = (req, res) => {

//   console.log("Webhook verification triggered");
//   console.log("$$$ query",req.query)
//   const mode = req.query["hub_mode"];
//   const token = req.query["hub_verify_token"];
//   const challenge = req.query["hub_challenge"];

//   console.log("Mode:", mode);
//   console.log("Token from Meta:", token);
//   console.log("Token from ENV:", process.env.VERIFY_TOKEN);

//   if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
//     console.log("Webhook verified successfully ✅");
//     return res.status(200).send(challenge);
//   }

//   console.log("Webhook verification failed ❌");
//   return res.sendStatus(403);
// };





// const receiveMessage = async (req, res) => {
//   try {
//     console.log(".................................................................... hit")
//     // ✅ WhatsApp ko turant ACK
//     res.sendStatus(200);

//     console.log("✅ Webhook triggered");
//     console.log(JSON.stringify(req.body, null, 2));

//     const incoming = extractIncomingMessage(req.body);
//     console.log("✅ Extracted incoming:", incoming);

//     if (!incoming || !incoming.text) return;

//     // ✅ PROPER MAPPING HERE
//     await runLangGraph({
//       phone: incoming.from,
//       text: incoming.text,
//       location: incoming.location,
//     });
//   } catch (err) {
//     console.error("❌ receiveMessage error:", err.response?.data || err.message);
//   }
// };


// module.exports = { verifyWebhook, receiveMessage };
