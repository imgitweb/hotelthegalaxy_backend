const router = require("express").Router();

const controller = require("../controllers/addressController");
const protect = require("../middleware/auth");

router.post("/", protect, controller.addAddress);
router.get("/", protect, controller.getAddresses);
router.patch("/default/:addressId", protect, controller.setDefaultAddress);
router.patch("/:addressId", protect, controller.updateAddress);
router.delete("/:addressId", protect, controller.deleteAddress);

module.exports = router;
