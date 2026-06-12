const mongoose = require("mongoose");

const waMessageSchema = new mongoose.Schema({
  conversation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppConversation', required: true },
  sender_id: { type: String, required: true },
  receiver_id: { type: String, required: true },
  text: { type: String, required: true },
  is_from_me: { type: Boolean, required: true },
  message_type: { type: String, enum: ['text', 'template', 'image', 'document'], default: 'text' },
  template_name: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("WhatsAppMessage", waMessageSchema);