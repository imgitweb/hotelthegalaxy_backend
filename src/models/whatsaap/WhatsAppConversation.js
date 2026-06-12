const mongoose = require("mongoose");

const waConversationSchema = new mongoose.Schema({
  phone_number_id: { type: String, required: true }, // Apka WA Number ID
  customer_phone: { type: String, required: true }, // Customer ka Number (with country code)
  customer_name: { type: String, default: "WA User" },
  last_message: { type: String, default: "" },
  last_message_time: { type: Date, default: Date.now },
  ai_enabled: { type: Boolean, default: true },
}, { timestamps: true });

waConversationSchema.index({ phone_number_id: 1, customer_phone: 1 }, { unique: true });

module.exports = mongoose.model("WhatsAppConversation", waConversationSchema);