const express = require("express");
const router = express.Router();
const { adminAuth, authorizeRoles } = require("../../middleware/adminAuth");
const orderAdminController = require("../../controllers/admin/orderAdminController");
router.get("/orders", adminAuth, authorizeRoles("admin", "manager"), orderAdminController.getAllOrders);
router.patch(
  "/orders/:id/status",
  adminAuth,
  authorizeRoles("admin", "manager"),
  orderAdminController.updateOrderStatus,
);
router.patch("/orders/:id/cancel", adminAuth, authorizeRoles("admin", "manager"), orderAdminController.cancelOrder);
router.patch(
  "/orders/:id/assign-rider",
  adminAuth,
  authorizeRoles("admin", "manager"),
  orderAdminController.assignRider,
);

module.exports = router;
