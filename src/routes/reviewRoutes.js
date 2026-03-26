const express = require("express");
const auth = require("../middleware/auth");
const {createReview,getReviewByOrder} = require("../controllers/reviewController");
const router = express.Router();
router.post("/", auth, createReview);
router.get("/order/:orderId", auth, getReviewByOrder);

module.exports = router;
