const express = require("express");
const rateLimit = require("express-rate-limit");
const { body } = require("express-validator");
const {
  adminLogin,
  adminLogout,
  getCurrentAdmin,
} = require("../controllers/adminAuthController");
const adminAuth = require("../middleware/adminAuth");
const validate = require("../middleware/validate");
const router = express.Router();
router.post(
  "/login",
  
  [
    body("email").trim().isEmail().withMessage("Valid email is required"),
    body("password")
      .isString()
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
  ],
  validate,
  adminLogin,
);

router.get("/me", adminAuth, getCurrentAdmin);
router.post("/logout", adminAuth, adminLogout);

module.exports = router;
