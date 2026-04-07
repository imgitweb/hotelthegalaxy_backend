const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    slug: {
      type: String,
      unique: true,
      
    },

    price: {
      type: Number,
      required: true,
      min: 0,
      
    },

    size: {
      type: String,
      required: true,
    },

    roomType: {
      type: String,
      required: true,
      enum: ["Suite", "Deluxe", "Standard", "Villa", "Penthouse"],
      
    },

    category: {
      type: String,
      enum: ["Suite", "Deluxe"],
      required: true,
    
    },

    maxGuests: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },

    bedType: {
      type: String,
      required: true,
      enum: [
        "King",
        "Queen",
        "Twin",
        "Double",
        "2 Queen Beds",
        "2 King Beds",
        "3 King Beds",
      ],
    },

    bedCount: {
      type: Number,
      default: 1,
      min: 1,
    },

    description: {
      type: String,
      required: true,
      maxlength: 2000,
    },

    images: {
      type: [String],
      required: function () {
        return this.isNew;
      },
      validate: {
        validator: (arr) =>
          Array.isArray(arr) && arr.length > 0 && arr.length <= 5,
        message: "1 to 5 images required",
      },
    },

    amenities: {
      type: [String],
      default: [],
    },

    isActive: {
      type: Boolean,
      default: true,
     
    },
    status: {
  type: String,
  enum: ["available", "booked", "maintenance"],
  default: "available",
  index: true,
},
  },
  { timestamps: true },
);

roomSchema.index({ category: 1, price: 1 });
roomSchema.index({ roomType: 1, maxGuests: 1 });

roomSchema.pre("save", function (next) {
  if (this.isModified("name")) {
    const baseSlug = this.name
      .toLowerCase()
      .replace(/ /g, "-")
      .replace(/[^\w-]+/g, "");

    this.slug = `${baseSlug}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 6)}`;
  }

  if (this.roomType === "Suite") {
    this.category = "Suite";
  } else if (this.roomType === "Deluxe") {
    this.category = "Deluxe";
  }
});

module.exports = mongoose.model("Room", roomSchema);
