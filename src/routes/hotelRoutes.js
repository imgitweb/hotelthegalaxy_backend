const express = require("express");
const { adminAuth, authorizeRoles } = require("../middleware/adminAuth");
const {
  getHotel,
  updateHotel,
} = require("../controllers/hotelController");

const router = express.Router();
router.use(adminAuth);
router.use(authorizeRoles("admin"));

router.get("/", getHotel);
router.patch("/", updateHotel);

module.exports = router;