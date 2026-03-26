const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const {
  createOffer,
  updateOffer,
  getOffers,
  getOfferById,
  deleteOffer
} = require("../controllers/offerController");
router.post("/", upload.single("image"), createOffer);
router.put("/:id", upload.single("image"), updateOffer);
router.get("/", getOffers);
router.get("/:id", getOfferById);
router.delete("/:id", deleteOffer);
module.exports = router;
