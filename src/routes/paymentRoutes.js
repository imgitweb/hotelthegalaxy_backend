const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const {
  createOrder,
  verifyPayment,
  handleCancel,
  previewTaxes,
} = require("../controllers/paymentController");

const {Data_for_checkout_page} = require("../utils/calculateETA")

router.post("/create-order", protect, createOrder);
router.post("/verify-payment", protect, verifyPayment);
router.post("/cancel", protect, handleCancel);
router.post("/preview-taxes", previewTaxes);
router.post("/get-fare",protect, Data_for_checkout_page);

module.exports = router;