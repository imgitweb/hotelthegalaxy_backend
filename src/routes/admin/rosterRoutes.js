const express = require("express");
const router = express.Router();
const { adminAuth, authorizeRoles } = require("../../middleware/adminAuth");
const controller = require("../../controllers/admin/dailyRosterController");

router.use(adminAuth);
router.use(authorizeRoles("admin", "manager"));


router.post("/dailyroster", controller.upsertRoster);
router.get("/getrosterbydate", controller.getRosterByDate);
router.get("/range", controller.getRosterRange);

module.exports = router;
