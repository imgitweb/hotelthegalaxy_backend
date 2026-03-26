const express = require("express");
const adminAuth = require("../middleware/adminAuth");
const {
  getHotel,
  updateHotel,
} = require("../controllers/hotelController");

const router = express.Router();

router.get("/", getHotel);
router.patch("/", adminAuth, updateHotel);

module.exports = router;