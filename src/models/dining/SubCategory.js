const mongoose = require("mongoose");
const slugify = require("slugify");

const subCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "SubCategory name is required"],
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      lowercase: true,
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiningCategory",
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
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
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

subCategorySchema.pre("save", async function () {
  if (!this.isModified("name")) return;

  let baseSlug = slugify(this.name, { lower: true, strict: true });
  let slug = baseSlug;
  let count = 1;

  while (
    await mongoose.models.SubCategory.findOne({
      slug,
      category: this.category,
      _id: { $ne: this._id },
    })
  ) {
    slug = `${baseSlug}-${count++}`;
  }

  this.slug = slug;
});

subCategorySchema.pre(/^find/, function () {
  this.where({ isDeleted: false });
});

subCategorySchema.virtual("menuItems", {
  ref: "MenuItem",
  localField: "_id",
  foreignField: "subCategory",
});

subCategorySchema.index({ category: 1, sortOrder: 1 });
subCategorySchema.index({ name: "text" });
subCategorySchema.index({ slug: 1, category: 1 }, { unique: true });

subCategorySchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  delete obj.isDeleted;
  delete obj.deletedAt;
  return obj;
};

module.exports = mongoose.model("SubCategory", subCategorySchema);