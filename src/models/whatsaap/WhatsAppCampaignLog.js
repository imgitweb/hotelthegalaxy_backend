const mongoose = require("mongoose");

const whatsappCampaignLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  phone_number_id: { type: String, required: true },
  template_name: { type: String, required: true },
  
  // NAYI FIELD: Analytics aur filtering ke liye zaroori hai
  template_id: { type: mongoose.Schema.Types.ObjectId, ref: "WhatsAppTemplate", required: false }, 
  
  total_recipients: { type: Number, default: 0 },
  successful_sends: { type: Number, default: 0 },
  failed_sends: { type: Number, default: 0 },
  
  delivery_details: [{
    phone: String,
    status: { type: String, enum: ["success", "failed"] },
    message_id: String,       
    error_message: String     
  }]
}, { timestamps: true });

module.exports = mongoose.model("WhatsAppCampaignLog", whatsappCampaignLogSchema);