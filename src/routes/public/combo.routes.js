const express = require("express");
const router = express.Router();
const multer = require("multer");
const comboController = require("../../controllers/public/combo.controller");
router.get("/combos", comboController.getCombo);
module.exports = router;
