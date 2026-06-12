const mongoose = require("mongoose");

const waAccountSchema = new mongoose.Schema({
  // userId hata diya gaya hai kyunki hum single-tenant (.env) use kar rahe hain
  waba_id: { type: String, required: true }, // WhatsApp Business Account ID
  phone_number_id: { type: String, required: true, unique: true }, // Jis number se message jayega
  display_phone_number: { type: String, required: true },
  
  // --- Profile Fields ---
  profile_picture_url: { type: String, default: "" },
  about: { type: String, default: "" },
  description: { type: String, default: "" },
  address: { type: String, default: "" },
  email: { type: String, default: "" },
  websites: [{ type: String }], 
  vertical: { type: String, default: "" }, // Industry/Category
  verified_name: { type: String, default: "" }, // WhatsApp Display Name
  name_status: { type: String, default: "UNKNOWN" }, // Approved, Pending, Rejected
  
  ai_enabled: { type: Boolean, default: false },
  access_token: { type: String, required: true }, // User ka Long Lived Token
}, { timestamps: true });

// Yahan dhyan dena, module.exports hona chahiye
module.exports = mongoose.model("WhatsAppAccount", waAccountSchema);