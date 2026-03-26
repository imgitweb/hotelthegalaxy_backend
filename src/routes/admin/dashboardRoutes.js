const express = require("express");
const router = express.Router();
const dashboard = require("../../controllers/admin/dashboardController");

router.get("/stats", dashboard.getDashboardStats);
router.get("/category-sales", dashboard.getCategorySales);
router.get("/top-dishes", dashboard.getTopDishes);
router.get("/orders-by-landmark", dashboard.getOrdersByLandmark);
router.get("/most-selling", dashboard.getMostSellingItem);

module.exports = router;
