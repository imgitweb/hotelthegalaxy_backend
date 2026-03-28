const DiningCategory = require("../../models/dining/diningCategorymodel");
const slugify = require("slugify");
const uploadToCloudinary = require("../../utils/cloudUpload");
const cloudinary = require("cloudinary").v2;


const create = async (req, res) => {
  try {
    const { name, description, sortOrder, isActive } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    let imageData = { url: "", public_id: "" };

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "categories");
      imageData = { url: result.secure_url, public_id: result.public_id };
    }

    // ✅ slug generate
    const baseSlug = slugify(name, { lower: true, strict: true });
    let slug = baseSlug;
    let count = 1;

    // ✅ duplicate slug handle
    while (await DiningCategory.findOne({ slug })) {
      slug = `${baseSlug}-${count++}`;
    }

    const category = await DiningCategory.create({
      name,
      slug, // ✅ IMPORTANT
      description,
      image: imageData,
      sortOrder: sortOrder ? Number(sortOrder) : 0,
      isActive: isActive === "false" ? false : true,
    });

    res.status(201).json({
      success: true,
      data: category,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const update = async (req, res) => {
  try {
    const categoryId = req.params.id;
    let category = await DiningCategory.findById(categoryId);
    if (!category)
      return res.status(404).json({ success: false, message: "Not found" });

    if (req.body.name) {
      req.body.slug = slugify(req.body.name, { lower: true, strict: true });
    }

    if (req.file) {
      // Old Image Cleanup
      if (category.image?.public_id) {
        await cloudinary.uploader.destroy(category.image.public_id);
      }
      const result = await uploadToCloudinary(req.file.buffer, "categories");
      req.body.image = { url: result.secure_url, public_id: result.public_id };
    }

    // Ensure data types
    if (req.body.sortOrder) req.body.sortOrder = Number(req.body.sortOrder);

    const updatedCategory = await DiningCategory.findByIdAndUpdate(
      categoryId,
      { $set: req.body },
      { returnDocument: "after", runValidators: true },
    );

    res.status(200).json({ success: true, data: updatedCategory });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const remove = async (req, res) => {
  try {
    const category = await DiningCategory.findById(req.params.id);
    if (!category)
      return res.status(404).json({ success: false, message: "Not found" });

    if (category.image?.public_id) {
      await cloudinary.uploader.destroy(category.image.public_id);
    }

    await DiningCategory.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error("Something went wrong", error);
    return res.status(500).json({ success: false, message: error });
  }
};

const getAll = async (req, res) => {
  try {
    const categories = await DiningCategory.find().sort({
      sortOrder: 1,
      createdAt: -1,
    });
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getById = async (req, res) => {
  try {
    const category = await DiningCategory.findById(req.params.id);
    if (!category)
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    res.status(200).json({ success: true, data: category });
  } catch (error) {
    res.status(400).json({ success: false, message: "Invalid ID" });
  }
};

module.exports = {
  create,
  update,
  getAll,
  getById,
  remove,
};
