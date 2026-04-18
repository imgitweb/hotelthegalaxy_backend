const express = require("express");
const router = express.Router();
const { getSettings, updateSettings } = require("../../controllers/admin/deliverySettingController");
const { adminAuth, authorizeRoles } = require("../../middleware/adminAuth");

// Add your admin authentication middleware here if you have one
// const { isAuthenticated, authorizeRoles } = require("../middlewares/auth");
// router.use(adminAuth);
router.get("/delivery", adminAuth, authorizeRoles("admin", "manager"), getSettings);
router.put("/delivery", adminAuth, authorizeRoles("admin", "manager"), updateSettings); // authorizeRoles("admin") laga sakte hain

module.exports = router;