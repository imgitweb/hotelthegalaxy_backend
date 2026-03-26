const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
  {
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
      unique: true,
      index: true,
    },

    currentStock: {
      type: Number,
      default: 100,
      min: 0,
    },

    reorderLevel: {
      type: Number,
      default: 10,
    },

    unit: {
      type: String,
      default: "units",
    },

    isLowStock: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Inventory", inventorySchema);
