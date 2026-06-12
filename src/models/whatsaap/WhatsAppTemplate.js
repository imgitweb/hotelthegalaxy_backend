const mongoose = require("mongoose");

const whatsappTemplateSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  phone_number_id: {
    type: String,
    required: true,
  },
  waba_id: {
    type: String,
    required: true,
  },
  meta_template_id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  language: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  // NAYI FIELD: Sirf internal use ke liye
  purpose: {
    type: String,
    default: "",
  },
  components: {
    type: Array, 
    default: [],
  },
  status: {
    type: String, 
    default: "PENDING",
  }
}, { timestamps: true });

const WhatsAppTemplate = mongoose.model("WhatsAppTemplate", whatsappTemplateSchema);

module.exports = WhatsAppTemplate;