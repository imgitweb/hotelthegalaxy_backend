const express = require("express");
const router = express.Router();

// controllers
const {
  getOffers,
  getOfferById,
  createOffer,
  updateOffer,
  deleteOffer,
} = require("../../controllers/offerController");

// multer middleware
const upload = require("../../middleware/upload");

// ================= ROUTES ================= //

// ✅ CREATE OFFER (with image upload)
router.post(
  "/",
  upload.single("image"), // 🔥 field must be "image"
  createOffer
);

// ✅ GET ALL OFFERS
router.get("/", getOffers);

// ✅ GET SINGLE OFFER
router.get("/:id", getOfferById);

// ✅ UPDATE OFFER (with optional image)
router.put(
  "/:id",
  upload.single("image"), // 🔥 same field name
  updateOffer
);

// ✅ DELETE OFFER
router.delete("/:id", deleteOffer);

module.exports = router;