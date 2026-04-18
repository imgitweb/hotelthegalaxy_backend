// const express = require("express");
// const router = express.Router();
// const multer = require("multer");
// const comboController = require("../../controllers/admin/comboController");
// const storage = multer.memoryStorage();
// const upload = multer({ storage });
// router.post("/combos", upload.array("images", 3), comboController.createCombo);
// router.put(
//   "/combos/:id",
//   upload.array("images", 3),
//   comboController.updateCombo,
// );
// router.get("/combos", comboController.getCombos);
// router.delete("/combos/:id", comboController.deleteCombo);

// module.exports = router;



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

// ✅ NEW ROUTES
router.patch("/combos/:id/toggle",adminAuth, authorizeRoles("admin", "manager"), comboController.toggleComboStatus);
router.patch("/combos/:id/restore",adminAuth, authorizeRoles("admin", "manager"), comboController.restoreCombo);

module.exports = router;