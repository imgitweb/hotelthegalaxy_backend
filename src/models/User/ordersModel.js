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
      min: 0,
      default: 0,
    },

    image: {
      type: String,
      default: null,
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
      default: 0,
    },

    lng: {
      type: Number,
      default: 0,
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
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
      },
    },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: {
      type: [orderItemSchema],
      validate: {
        validator: (items) => items.length > 0,
        message: "Order must contain at least one item",
      },
    },

    pricing: {
      subtotal: {
        type: Number,
        default: 0,
      },
      tax: {
        type: Number,
        default: 0,
      },
      deliveryCharge: {           // ✅ fix: was missing, controller uses this
        type: Number,
        default: 0,
      },
      total: {
        type: Number,
        default: 0,
      },
    },

    distanceKm: {                 // ✅ fix: was missing, controller saves this
      type: Number,
      default: 0,
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
    },

    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      default: null,
    },

    deliveryOTP: {
      code: {
        type: String,
        default: null,
      },
      generatedAt: {
        type: Date,
        default: null,
      },
      verifiedAt: {
        type: Date,
        default: null,
      },
      attempts: {
        type: Number,
        default: 0,
      },
      maxAttempts: {
        type: Number,
        default: 3,
      },
    },

    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "out_for_delivery",
        "arrived",
        "delivered",
        "cancelled",
      ],
      default: "pending",
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
      default: 0,
    },

    duration: {
      type: Number,
      default: 0,
    },

    timeline: {
      confirmedAt: Date,
      preparingAt: Date,
      readyAt: Date,
      pickedAt: Date,
      arrivedAt: Date,
      deliveredAt: Date,
      cancelledAt: Date,
    },

    payment: {
      method: {
        type: String,
        default: null,
      },
      status: {
        type: String,
        enum: ["pending", "paid", "failed"],
        default: "pending",
      },
      transactionId: {
        type: String,
        default: null,
      },
    },

    source: {
      type: String,
      enum: ["website", "whatsapp"],
      default: "website",
    },

    noContact: {                  // ✅ fix: checkout page sends this but field missing tha
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// ✅ Pre-save hook — sab location fields auto-set
orderSchema.pre("save", async function () {
  if (this.address?.lat && this.address?.lng) {
    this.address.location = {
      type: "Point",
      coordinates: [this.address.lng, this.address.lat],
    };
  }

  if (this.restaurantLocation?.lat && this.restaurantLocation?.lng) {
    this.restaurantLocation.location = {
      type: "Point",
      coordinates: [
        this.restaurantLocation.lng,
        this.restaurantLocation.lat,
      ],
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
});

module.exports = mongoose.model("Orders", orderSchema);