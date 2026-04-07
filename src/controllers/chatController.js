const { runLangGraph } = require("../langraph/services/langgraphService");
const {sendTextMessage} = require("../langraph/services/whatsappService")



exports.chatMessage = async (req, res) => {
  try {
    console.log("$$$ req.body", req.body);
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ reply: "Invalid message" });
    }

    // 🔥 STATIC DATA
    const staticPhone = "8103306133";
    const staticFullName = "CK";

    console.log(`✅ Running Web Chat for Static User: ${staticFullName} (${staticPhone})`);

    // 🔥 LangGraph call
    const output = await runLangGraph({
      phone: staticPhone,        
      text: message,
      fullName: staticFullName, 
      channel: "web"            
    });

    console.log("✅ LangGraph output:", output);

    // 🔥 Frontend ko reply aur NAYA interactive object return kar rahe hain
    return res.json({
      // Agar replyText khali hai toh interactive ki body le lo
      reply: output?.replyText || output?.interactive?.body?.text || "✅ Message processed",
      interactive: output?.interactive || null, // WhatsApp jaisa button/list format
      placedOrder: output?.placedOrder || null,
    });

  } catch (err) {
    console.error("❌ chatMessage error:", err.message);
    return res.status(500).json({ reply: "Server error" });
  }
};


// chatController.js ke andar add karein

exports.testWhatsAppTrigger = async (req, res) => {
  try {
    const { message } = req.body; // Jo message aap Postman ya frontend se bhejenge

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // 🔥 YAHAN APNA REAL WHATSAPP NUMBER DAALEIN (With 91, no + sign)
    const myWhatsAppNumber = "918103306133"; 
    const myName = "Himanshu";

    console.log(`🚀 Sending test message to WhatsApp: ${myWhatsAppNumber}`);

    // 🔥 LangGraph call with channel "whatsapp"
    const output = await runLangGraph({
      phone: myWhatsAppNumber,        
      text: message,
      fullName: myName, 
      channel: "whatsapp" // 👉 Ye flag batayega ki reply WhatsApp pe bhejna hai
    });

    return res.json({ 
      success: true, 
      info: "✅ Message aapke WhatsApp par bhej diya gaya hai!",
      langgraphOutput: output
    });



  } catch (err) {
    console.error("❌ testWhatsAppTrigger error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
};