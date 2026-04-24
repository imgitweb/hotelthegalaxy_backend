const express = require("express");
const router = express.Router();
const riderController = require("../../controllers/admin/rider.controller");
const {adminAuth , authorizeRoles} = require("../../middleware/adminAuth")

router.use(adminAuth);
router.use(authorizeRoles("admin","manager"));

router.post("/", riderController.createRider);
router.get("/", riderController.getRiders);
router.put("/:id", riderController.updateRider);
router.delete("/:id",riderController.deleteRider);

module.exports = router;
