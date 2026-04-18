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

const storage = multer.memoryStorage();
const upload = multer({ storage });

// CRUD
router.post("/combos", upload.array("images", 3), comboController.createCombo);
router.get("/combos", comboController.getCombos);
router.put("/combos/:id", upload.array("images", 3), comboController.updateCombo);
router.delete("/combos/:id", comboController.deleteCombo);

// ✅ NEW ROUTES
router.patch("/combos/:id/toggle", comboController.toggleComboStatus);
router.patch("/combos/:id/restore", comboController.restoreCombo);

module.exports = router;