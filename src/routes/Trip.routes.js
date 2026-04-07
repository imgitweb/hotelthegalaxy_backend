const express = require("express");
const router = express.Router();
const TripController = require("../../controllers/TripController");


router.post("/create", TripController.createTrip);

router.get("/", TripController.getTrips);

router.get("/:tripId", TripController.getTripDetails);

router.patch("/:tripId/cancel", TripController.cancelTrip);

module.exports = router;