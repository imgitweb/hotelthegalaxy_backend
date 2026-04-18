const express = require("express");
const router = express.Router();
const dashboard = require("../../controllers/admin/dashboardController");
const { adminAuth, authorizeRoles } = require("../../middleware/adminAuth")

router.get("/stats", adminAuth , authorizeRoles("admin"), dashboard.getDashboardStats);
router.get("/category-sales", adminAuth , authorizeRoles("admin"), dashboard.getCategorySales);
router.get("/top-dishes", adminAuth , authorizeRoles("admin"), dashboard.getTopDishes);
router.get("/orders-by-landmark",adminAuth , authorizeRoles("admin"), dashboard.getOrdersByLandmark);
router.get("/most-selling",adminAuth , authorizeRoles("admin"), dashboard.getMostSellingItem);

module.exports = router;
