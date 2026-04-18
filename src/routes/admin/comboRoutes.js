const express = require("express");
const router = express.Router();
const multer = require("multer");
const comboController = require("../../controllers/admin/comboController");
const { adminAuth, authorizeRoles } = require("../../middleware/adminAuth")
const storage = multer.memoryStorage();
const upload = multer({ storage });
router.post("/combos", upload.array("images", 3), adminAuth, authorizeRoles("admin", "manager"), comboController.createCombo);
router.put(
  "/combos/:id",
  upload.array("images", 3),
  adminAuth, authorizeRoles("admin", "manager"),
  comboController.updateCombo,
);
router.get("/combos",adminAuth, authorizeRoles("admin", "manager"), comboController.getCombos);
router.delete("/combos/:id",adminAuth, authorizeRoles("admin", "manager"), comboController.deleteCombo);

module.exports = router;
