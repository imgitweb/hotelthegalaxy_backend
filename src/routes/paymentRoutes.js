const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser"); // ✅ add karo
const protect = require("../middleware/auth");
const {
  createOrder,
  verifyPayment,
  handleCancel,
} = require("../controllers/paymentController");
const { handleWebhook } = require("../controllers/webhookController");
router.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  handleWebhook,
);
router.post("/create-order", protect, createOrder);
router.post("/verify-payment", protect, verifyPayment);
router.post("/cancel", protect, handleCancel);

module.exports = router;