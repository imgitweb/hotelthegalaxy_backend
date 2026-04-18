// const express = require("express");
// const router = express.Router();
// const upload = require("../middleware/upload");
// const {
//   createOffer,
//   updateOffer,
//   getOffers,
//   getOfferById,
//   deleteOffer
// } = require("../controllers/offerController");
// router.post("/", upload.single("image"), createOffer);
// router.put("/:id", upload.single("image"), updateOffer);
// router.get("/", getOffers);
// router.get("/:id", getOfferById);
// router.delete("/:id", deleteOffer);
// module.exports = router;



const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const {
  createOffer,
  updateOffer,
  getOffers,
  getActiveOffers,
  getOfferById,
  deleteOffer,
  toggleOffer,
  restoreOffer,
} = require("../controllers/offerController");

router.get("/active", getActiveOffers);           // user-facing
router.get("/", getOffers);                        // admin: all offers
router.get("/:id", getOfferById);

router.post("/", upload.single("image"), createOffer);
router.put("/:id", upload.single("image"), updateOffer);

router.patch("/:id/toggle", toggleOffer);
router.patch("/:id/restore", restoreOffer);

router.delete("/:id", deleteOffer);

module.exports = router;