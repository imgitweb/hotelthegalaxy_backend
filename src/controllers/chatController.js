const { runLangGraph } = require("../langraph/services/langgraphService");
// const User = require("../models/User"); // Iski abhi zaroorat nahi agar hum direct static data bhej rahe hain

exports.chatMessage = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ reply: "Invalid message", buttons: [] });
    }

    // 🔥 STATIC DATA USE KAR RAHE HAIN
    const staticPhone = "9691267061";
    const staticFullName = "Manisha Mewada";

    console.log(`✅ Running Web Chat for Static User: ${staticFullName} (${staticPhone})`);

    // 🔥 LangGraph call
    const output = await runLangGraph({
      phone: staticPhone,         
      text: message,
      fullName: staticFullName, 
      channel: "web"            // Web channel flag
    });

    console.log("✅ LangGraph output:", output);

    // Frontend ko reply aur buttons return kar rahe hain
    return res.json({
      reply: output?.replyText || "✅ Message processed",
      buttons: output?.buttons || [], 
      placedOrder: output?.placedOrder || null,
    });

  } catch (err) {
    console.error("❌ chatMessage error:", err.message);
    return res.status(500).json({ reply: "Server error", buttons: [] });
  }
};