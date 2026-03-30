const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const {
  createOrder,
  verifyPayment,
} = require("../controllers/paymentController");

router.post("/create-order", protect, createOrder);
router.post("/verify-payment", protect, verifyPayment);

module.exports = router;