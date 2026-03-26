const express = require("express");
const router = express.Router();
const staffController = require("../../controllers/admin/staffController");

router.post("/", staffController.createStaff);
router.get("/", staffController.getStaff);
router.put("/:id", staffController.updateStaff);
router.delete("/:id", staffController.deleteStaff);

module.exports = router;