const mongoose = require("mongoose");
const addressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      
    },

    street: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 200,
    },

    landmark: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 200,
    },

    label: {
      type: String,
      enum: ["Home", "Work", "Other"],
      default: "Home",
    },

    lat: {
      type: Number,
      required: true,
      
    },

    lng: {
      type: Number,
      required: true,
      
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
        index: "2dsphere",
      },
    },

    isDefault: {
      type: Boolean,
      default: false,
      
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Address", addressSchema);
