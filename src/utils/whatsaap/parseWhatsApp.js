function extractIncomingMessage(body) {
  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value;

    // ✅ Ignore status updates (sent, delivered, read)
    if (value?.statuses?.length) return null;

    const msg = value?.messages?.[0];
    if (!msg) return null;

    let extractedText = "";
    let extractedLocation = null;

    // 🔥 1. Agar normal text message hai
    if (msg.type === "text") {
      extractedText = msg.text?.body || "";
    } 
    // 🔥 2. Agar interactive message hai (Button ya List click kiya gaya hai)
    else if (msg.type === "interactive") {
      const interactive = msg.interactive;
      
      if (interactive?.type === "button_reply") {
        extractedText = interactive.button_reply?.id || interactive.button_reply?.title || "";
      } 
      else if (interactive?.type === "list_reply") {
        extractedText = interactive.list_reply?.id || interactive.list_reply?.title || "";
      }
    }
    // 🔥 3. NAYA: Agar user ne WhatsApp par Location share ki hai
    else if (msg.type === "location") {
      console.log("📍 Location Received!"); 
      extractedLocation = {
        // ✅ YAHAN CHANGE KIYA HAI: lat/lng ki jagah latitude/longitude
        lat: msg.location.latitude,   
        lng: msg.location.longitude,  
        address: msg.location.address || msg.location.name || "Shared Location"
      };
      // AI graph ko batane ke liye ek hidden keyword set kar diya
      extractedText = "shared_location"; 
    }

    return {
      from: msg.from,
      text: extractedText,
      messageId: msg.id,
      timestamp: msg.timestamp,
      location: extractedLocation, // 🔥 Location ka data yahan se pass hoga
      raw: msg,
    };
  } catch (err) {
    console.error("❌ Message Extraction Error:", err);
    return null;
  }
}

module.exports = { extractIncomingMessage };