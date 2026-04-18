const express = require("express");
const router = express.Router();
const { adminAuth, authorizeRoles } = require("../../middleware/adminAuth")

const {
  getAvailability,
  updateAvailability,
} = require("../../controllers/availabilityController");

router.get("/", adminAuth, authorizeRoles("admin", "manager"),  getAvailability);
router.put("/",adminAuth, authorizeRoles("admin", "manager"), updateAvailability); // admin protect later

module.exports = router;