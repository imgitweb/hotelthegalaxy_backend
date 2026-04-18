const express = require("express");
const router = express.Router();
const { adminAuth, authorizeRoles } = require("../../middleware/adminAuth");
const validate = require("../../middleware/validate");
const upload = require("../../middleware/upload");

const MenuController = require("../../controllers/admin/menuController");

console.log("LOADED FILE:", require.resolve("../../controllers/admin/menuController"));
const {
  createMenuValidation,
  updateMenuValidation,
} = require("../../validations/dining/menuValidation");

router.use(adminAuth);
router.use(authorizeRoles("admin", "manager"));


router
  .route("/menu")
  .get(MenuController.getAll)
  .post(
    upload.array("images", 5),
    createMenuValidation,
    validate,
    MenuController.create,
  );
router.patch("/menu/bulk", MenuController.bulkUpdate);
router.patch("/menu/:id/availability", MenuController.toggleAvailability);
router.patch("/menu/:id/restore", MenuController.restore);
router
  .route("/menu/:id")
  .get(MenuController.getById)
  .patch(
    upload.array("images", 5),
    updateMenuValidation,
    validate,
    MenuController.update,
  )
  .delete(MenuController.remove);

module.exports = router;
