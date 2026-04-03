const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const {
  createOrder,
  verifyPayment,
  handleCancel,
} = require("../controllers/paymentController");

router.post("/create-order", protect, createOrder);
router.post("/verify-payment", protect, verifyPayment);
router.post("/cancel", protect, handleCancel);

module.exports = router;