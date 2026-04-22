const express = require("express");
const router = express.Router();
const { checkItemAvailability } = require("../controllers/roster.controller");

// Public route for frontend
router.get("/check-availability/:itemId", checkItemAvailability);

module.exports = router;