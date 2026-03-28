const mongoose = require("mongoose");
const slugify = require("slugify");

const menuItemSchema = new mongoose.Schema(
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
      lowercase: true,
      index: true,
    },

    description: String,

    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
      required: true,
      index: true,
    },

    basePrice: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },
      todayPrice: {
      type: Number,
      min: 0,
  
    },

    taxPercent: {
      type: Number,
      default: 5,
    },

    images: [
      {
        url: { type: String, required: true },
        public_id: { type: String, required: true },
      },
    ],

    isVeg: {
      type: Boolean,
      default: true,
      index: true,
    },

    isJain: {
      type: Boolean,
      default: false,
      index: true,
    },

    isAvailable: {
      type: Boolean,
      default: true,
      index: true,
    },

    availabilityReason: {
      type: String,
      enum: ["MANUAL", "OUT_OF_STOCK", "KITCHEN_BUSY"],
      default: "MANUAL",
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },

    preparationTime: {
      type: Number,
      default: 15,
    },

    spiceLevel: {
      type: String,
      enum: ["MILD", "MEDIUM", "SPICY"],
      default: "MEDIUM",
    },

    ingredients: [String],
    allergens: [String],
  },
  { timestamps: true }
);

menuItemSchema.pre("save", async function () {
  if (!this.isModified("name")) return;

  let baseSlug = slugify(this.name, { lower: true, strict: true });
  let slug = baseSlug;
  let count = 1;

  while (
    await mongoose.models.MenuItem.findOne({
      slug,
      _id: { $ne: this._id },
    })
  ) {
    slug = `${baseSlug}-${count++}`;
  }

  this.slug = slug;
});

menuItemSchema.pre(/^find/, function () {
  this.where({ isDeleted: false });
});

menuItemSchema.index({ subCategory: 1, isAvailable: 1 });
menuItemSchema.index({ name: "text", description: "text" });

module.exports = mongoose.model("MenuItem", menuItemSchema);