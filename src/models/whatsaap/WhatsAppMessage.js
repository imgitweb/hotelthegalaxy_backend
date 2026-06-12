const mongoose = require("mongoose");

const waMessageSchema = new mongoose.Schema({
  // Unique Meta Message ID (Ye update tracking ke liye zaroori hai)
  message_id: { type: String, unique: true, sparse: true }, 

  conversation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppConversation', required: true },
  sender_id: { type: String, required: true },
  receiver_id: { type: String, required: true },
  text: { type: String }, // Optional kar dein kyunki image/interactive mein text nahi bhi ho sakta hai
  is_from_me: { type: Boolean, required: true },
  
  message_type: {
    type: String,
    enum: ['text', 'image', 'video', 'document', 'audio', 'template', 'interactive', 'button', 'location', 'contacts'], 
    default: 'text'
  },
  template_name: { type: String },

  // ✅ New Field: Status Tracking
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent' // Outgoing messages starts as 'sent'
  },
  
  // ✅ Optional: Store failure reasons if status === 'failed'
  meta_data: { type: mongoose.Schema.Types.Mixed } 

}, { timestamps: true });

module.exports = mongoose.model("WhatsAppMessage", waMessageSchema);