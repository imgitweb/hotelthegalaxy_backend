const mongoose = require("mongoose");

const dailyRosterSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
    },

    items: [
      {
        id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MenuItem",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          default: 10,
        },
      },
    ],

    notes: {
      type: String,
      maxlength: 500,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

dailyRosterSchema.index({ date: 1 }, { unique: true });

module.exports = mongoose.model("DailyRoster", dailyRosterSchema);
