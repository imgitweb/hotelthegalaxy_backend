const express = require("express");
const router = express.Router();
const adminAuth = require("../../middleware/adminAuth");
const validate = require("../../middleware/validate");
const upload = require("../../middleware/upload");
const DiningCategoryController = require("../../controllers/admin/diningCategoryController");
const {
  createCategoryValidation,
  updateCategoryValidation,
} = require("../../validations/dining/categoryValidation");

router.use(adminAuth);
router
  .route("/categories")
  .get(DiningCategoryController.getAll)
  .post(
    upload.single("image"),
    createCategoryValidation,
    validate,
    DiningCategoryController.create,
  );
router
  .route("/categories/:id")
  .get(DiningCategoryController.getById)
  .patch(
    upload.single("image"),
    updateCategoryValidation,
    validate,
    DiningCategoryController.update,
  )
  .delete(DiningCategoryController.remove);

module.exports = router;
