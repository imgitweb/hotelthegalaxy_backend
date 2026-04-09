const mongoose = require("mongoose");

const qrSessionSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
  },

  isActive: {
    type: Boolean,
    default: true,
  },

  expiresAt: {
    type: Date,
    required: true,
  },
});

module.exports = mongoose.model("QRCodeSession", qrSessionSchema);