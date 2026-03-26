const express = require("express");
const router = express.Router();
const riderController = require("../../controllers/admin/rider.controller");

router.post("/", riderController.createRider);
router.get("/", riderController.getRiders);
router.put("/:id", riderController.updateRider);

module.exports = router;
