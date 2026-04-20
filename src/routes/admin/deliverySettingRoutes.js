const express = require("express");
const router = express.Router();
const { getSettings, updateSettings } = require("../../controllers/admin/deliverySettingController");
const { adminAuth, authorizeRoles } = require("../../middleware/adminAuth");

// Route configurations
router.get("/delivery", adminAuth, authorizeRoles("admin", "manager"), getSettings);
router.put("/delivery", adminAuth, authorizeRoles("admin", "manager"), updateSettings);

module.exports = router;