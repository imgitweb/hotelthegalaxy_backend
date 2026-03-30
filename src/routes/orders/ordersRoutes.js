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

const protect = require("../../middleware/auth");
const checkAvailability = require("../../middleware/checkAvailability");

const orderController = require("../../controllers/orders/ordersController");
const Data_for_checkout_page = require("../../utils/calculateETA");

console.log("Loading Orders Routes...");
console.log("Controller loaded:", orderController);
console.log("Protect middleware:", protect);

router.post(
  "/",
  protect,
  checkAvailability, 
  (req, res, next) => {
    console.log("POST /orders called");
    orderController.createOrder(req, res, next);
  }
);

router.get("/", protect, (req, res, next) => {
  console.log("GET /orders called");
  orderController.getMyOrders(req, res, next);
});


router.get("/:id", protect, (req, res, next) => {
  console.log("GET /orders/:id called");
  orderController.getOrderById(req, res, next);
});

router.patch("/:id/status", protect, (req, res, next) => {
  console.log("PATCH /orders/:id/status called");
  orderController.updateOrderStatus(req, res, next);
});


router.patch("/:orderId/cancel", protect, (req, res, next) => {
  console.log("PATCH /orders/:orderId/cancel called");
  orderController.cancelOrder(req, res, next);
});

router.post("/get_fare", Data_for_checkout_page)

module.exports = router;