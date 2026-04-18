const express = require("express");
const router = express.Router();

const { adminAuth, authorizeRoles } = require("../../middleware/adminAuth");
const validate = require("../../middleware/validate");

const SubCategoryController = require("../../controllers/admin/subCategoryController");

const {
  createSubCategoryValidation,
  updateSubCategoryValidation,
} = require("../../validations/dining/subCategoryValidation");

router.use(adminAuth);
router.use(authorizeRoles("admin", "manager"));

router
  .route("/subcategories")
  .get(SubCategoryController.getAll)
  .post(
    createSubCategoryValidation,
    validate,
    SubCategoryController.create
  );

router
  .route("/subcategories/:id")
  .get(SubCategoryController.getById)
  .patch(
    updateSubCategoryValidation,
    validate,
    SubCategoryController.update
  )
  .delete(SubCategoryController.remove);

router.patch(
  "/subcategories/:id/restore",
  SubCategoryController.restore || ((req, res) =>
    res.status(501).json({
      success: false,
      message: "Restore not implemented",
    }))
);

module.exports = router;
