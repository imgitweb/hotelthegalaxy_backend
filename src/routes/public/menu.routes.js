const router = require("express").Router();
const controller = require("../../controllers/public/menu.controller");
router.get("/", controller.getMenuForUsers);
router.get("/daily", controller.getDailyRosterMenu);

module.exports = router;
