const express = require("express");
const router = express.Router();

const {
  getAvailability,
  updateAvailability,
} = require("../../controllers/availabilityController");

router.get("/", getAvailability);
router.put("/", updateAvailability); // admin protect later

module.exports = router;