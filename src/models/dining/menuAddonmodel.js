const mongoose = require("mongoose");

const menuAddonSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    addons: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuAddon",
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("MenuAddon", menuAddonSchema);
