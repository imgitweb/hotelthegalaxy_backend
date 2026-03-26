// const express = require("express");
// const router = express.Router();
// const checkAvailability = require("../middlewares/checkAvailability");
// console.log("Loading Orders Routes...");

// const orderController = require("../../controllers/orders/ordersController");
// const protect = require("../../middleware/auth");

// console.log("Controller loaded:", orderController);
// console.log("Protect middleware:", protect);

// router.post("/", protect, (req, res, next) => {
//   console.log("POST /orders called");
//   orderController.createOrder(req, res, next);
// });

// router.get("/", protect, (req, res, next) => {
//   console.log("GET /orders called");
//   orderController.getMyOrders(req, res, next);
// });
// router.get("/:id", protect, (req, res, next) => {
//   console.log("GET /orders/:id called");
//   orderController.getOrderById(req, res, next);
// });
// router.patch("/:id/status", protect, orderController.updateOrderStatus);

// router.patch("/:orderId/cancel", protect, orderController.cancelOrder);

// module.exports = router;



const express = require("express");
const router = express.Router();

// 🔐 Middlewares
const protect = require("../../middleware/auth");
const checkAvailability = require("../../middleware/checkAvailability");

// 🎯 Controller
const orderController = require("../../controllers/orders/ordersController");

// 🧠 Debug Logs (optional - remove in production)
console.log("Loading Orders Routes...");
console.log("Controller loaded:", orderController);
console.log("Protect middleware:", protect);

/**
 * @route   POST /api/v1/orders
 * @desc    Create Order (Protected + Availability Check)
 */
router.post(
  "/",
  protect,
  checkAvailability, // 🔥 IMPORTANT: Blocks if kitchen closed / disabled
  (req, res, next) => {
    console.log("POST /orders called");
    orderController.createOrder(req, res, next);
  }
);

/**
 * @route   GET /api/v1/orders
 * @desc    Get My Orders
 */
router.get("/", protect, (req, res, next) => {
  console.log("GET /orders called");
  orderController.getMyOrders(req, res, next);
});

/**
 * @route   GET /api/v1/orders/:id
 * @desc    Get Order By ID
 */
router.get("/:id", protect, (req, res, next) => {
  console.log("GET /orders/:id called");
  orderController.getOrderById(req, res, next);
});

/**
 * @route   PATCH /api/v1/orders/:id/status
 * @desc    Update Order Status (Admin / Kitchen)
 */
router.patch("/:id/status", protect, (req, res, next) => {
  console.log("PATCH /orders/:id/status called");
  orderController.updateOrderStatus(req, res, next);
});

/**
 * @route   PATCH /api/v1/orders/:orderId/cancel
 * @desc    Cancel Order
 */
router.patch("/:orderId/cancel", protect, (req, res, next) => {
  console.log("PATCH /orders/:orderId/cancel called");
  orderController.cancelOrder(req, res, next);
});

module.exports = router;