const express = require("express");
const router = express.Router();
const protect = require("../../middleware/adminAuth");
const orderAdminController = require("../../controllers/admin/orderAdminController");
const authorize = require("../../middleware/authorize");
router.get(
  "/orders",
  protect,
  authorize("admin", "manager"),
  orderAdminController.getAllOrders
);
router.patch(
  "/orders/:id/status",
  protect,
  authorize("admin", "manager"),
  orderAdminController.updateOrderStatus
);
router.patch(
  "/orders/:id/cancel",
  protect,
  authorize("admin","manager"),
  orderAdminController.cancelOrder
);
router.patch(
  "/orders/:id/assign-rider",
  protect,
  authorize("admin", "manager"),
  orderAdminController.assignRider
);

module.exports = router;
