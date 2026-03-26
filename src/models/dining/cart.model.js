const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema({
  menuItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MenuItem",
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MenuVariant",
  },
  addonIds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuAddon",
    },
  ],
  quantity: Number,
  priceSnapshot: Number,
});

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    items: [cartItemSchema],

    subtotal: Number,
    tax: Number,
    discount: Number,
    grandTotal: Number,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Cart", cartSchema);
