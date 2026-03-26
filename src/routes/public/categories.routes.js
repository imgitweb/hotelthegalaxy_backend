const router = require("express").Router();
const controller = require("../../controllers/public/categories.controller");
router.get("/", controller.getCategoriesForUsers);

module.exports = router;
