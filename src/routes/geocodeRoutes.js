const express = require("express");
const router = express.Router();
const { getLatLng } = require("../controllers/geocode.controller");
router.get("/latlng", getLatLng);
module.exports = router;
