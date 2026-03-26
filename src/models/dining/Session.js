const mongoose = require("mongoose");

const SessionSchema = new mongoose.Schema(
  {
    phone: { type: String, unique: true },
    step: { type: String, default: "HOME" }, // HOME / ORDERING / ASK_ADDRESS / CONFIRM
    cart: { type: Array, default: [] },      // [{menuId,name,price,qty}]
    address: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Session", SessionSchema);
