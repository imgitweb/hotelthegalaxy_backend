function extractIncomingMessage(body) {
  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value;

    // ✅ Ignore status updates (sent, delivered, read)
    if (value?.statuses?.length) return null;

    const msg = value?.messages?.[0];
    if (!msg) return null;

    let extractedText = "";

    // 🔥 1. Agar normal text message hai
    if (msg.type === "text") {
      extractedText = msg.text?.body || "";
    } 
    // 🔥 2. Agar interactive message hai (Button ya List click kiya gaya hai)
    else if (msg.type === "interactive") {
      const interactive = msg.interactive;
      
      // Jab Button click hota hai
      if (interactive?.type === "button_reply") {
        // Hum ID extract karenge (jaise 'btn_help' ya 'addr_123')
        extractedText = interactive.button_reply?.id || interactive.button_reply?.title || "";
      } 
      // Jab List item select hota hai (Menu categories)
      else if (interactive?.type === "list_reply") {
        // Hum ID extract karenge (jaise 'cat_123')
        extractedText = interactive.list_reply?.id || interactive.list_reply?.title || "";
      }
    }

    return {
      from: msg.from,
      text: extractedText,
      messageId: msg.id,
      timestamp: msg.timestamp,
      raw: msg,
    };
  } catch (err) {
    console.error("❌ Message Extraction Error:", err);
    return null;
  }
}

module.exports = { extractIncomingMessage };