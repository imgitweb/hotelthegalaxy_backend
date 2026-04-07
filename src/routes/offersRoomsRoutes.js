const router = require("express").Router();
const offersRoomsController = require("../controllers/roomsOfferController");

router.get("/", offersRoomsController.getOffers);
router.post("/", offersRoomsController.createOffer);
router.put("/:id", offersRoomsController.updateOffer);
router.delete("/:id", offersRoomsController.deleteOffer);

module.exports = router;