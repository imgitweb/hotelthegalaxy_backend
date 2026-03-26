const express = require("express");
const router = express.Router();
const adminAuth = require("../../middleware/adminAuth");
const validate = require("../../middleware/validate");

const addonController = require("../../controllers/admin/addonController");

const {
  createAddonValidation,
} = require("../../validations/dining/addon.validation");

router.use(adminAuth);

router
  .route("/addons")
  .post(createAddonValidation, validate, addonController.create);

module.exports = router;
