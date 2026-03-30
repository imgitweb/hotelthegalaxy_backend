const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
    },

    combo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Combo",
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    total: {
      type: Number,
      // required: true,
      min: 0,
      default  : 0
    },
  },
  { _id: false },
);

const orderAddressSchema = new mongoose.Schema(
  {
    street: String,
    landmark: String,

    label: {
      type: String,
      enum: ["Home", "Work", "Other"],
    },

    lat: {
      type: Number,
      required: true,
      // index: true,
    },

    lng: {
      type: Number,
      required: true,
      // index: true,
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        // required: true,
        // index: "2dsphere",
      },
    },
  },
  { _id: false },
);

const restaurantLocationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
        // index: "2dsphere",
      },
    },
  },
  { _id: false },
);

const partnerLocationSchema = new mongoose.Schema(
  {
    lat: Number,
    lng: Number,

    updatedAt: {
      type: Date,
      default: Date.now,
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        // index: "2dsphere",
      },
    },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      // unique: true,
      // index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      // index: true,
    },

    items: {
      type: [orderItemSchema],
      validate: {
        validator: (items) => items.length > 0,
        message: "Order must contain at least one item",
      },
    },

    pricing: {
      subtotal: Number,
      tax: Number,
      total: Number,
      deliveryFee: Number,
    },

    address: {
      type: orderAddressSchema,
      required: true,
    },

    restaurantLocation: {
      type: restaurantLocationSchema,
      required: false,
    },

    deliveryPartnerLocation: {
      type: partnerLocationSchema,
      default: null,
    },

    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      default: null,
      // index: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "READY",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      default: "pending",
      // index: true,
    },

    prepTimeRemaining: {
      type: Number,
      default: 0,
    },

    eta: {
      type: Number,
      default: 0,
    },

    distance: {
      type: Number,
    },

    duration: {
      type: Number,
    },

    timeline: {
      confirmedAt: Date,
      preparingAt: Date,
      readyAt: Date,
      pickedAt: Date,
      deliveredAt: Date,
      cancelledAt: Date,
    },

    payment: {
      method: String,
      status: {
        type: String,
        enum: ["pending", "paid", "failed"],
        default: "pending",
      },
      transactionId: String,
    },
    distanceKm: {
      type: Number,
      default: 0,
    },

    pricing: {
      subtotal: Number,
      tax: Number,
      deliveryCharge: Number,
      total: Number,
    },
  },
  {
    timestamps: true,
  },
);

orderSchema.pre("save", function (next) {
  if (this.address?.lat && this.address?.lng) {
    this.address.location = {
      type: "Point",
      coordinates: [this.address.lng, this.address.lat],
    };
  }

  if (this.restaurantLocation?.lat && this.restaurantLocation?.lng) {
    this.restaurantLocation.location = {
      type: "Point",
      coordinates: [this.restaurantLocation.lng, this.restaurantLocation.lat],
    };
  }

  if (this.deliveryPartnerLocation?.lat && this.deliveryPartnerLocation?.lng) {
    this.deliveryPartnerLocation.location = {
      type: "Point",
      coordinates: [
        this.deliveryPartnerLocation.lng,
        this.deliveryPartnerLocation.lat,
      ],
    };

    this.deliveryPartnerLocation.updatedAt = new Date();
  }

  // next();
});

module.exports = mongoose.model("Orders", orderSchema);
