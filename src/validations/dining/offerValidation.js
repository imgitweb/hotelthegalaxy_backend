const { body, param } = require("express-validator");

exports.createOfferValidation = [
  body("title").notEmpty().withMessage("Offer title is required"),

  body("type")
    .notEmpty()
    .withMessage("Offer type is required")
    .isIn(["FLAT", "PERCENTAGE", "BOGO", "COMBO"])
    .withMessage("Invalid offer type"),

  body("discountValue")
    .notEmpty()
    .withMessage("Discount value is required")
    .isFloat({ min: 0 })
    .withMessage("Discount must be positive"),

  body("startDate")
    .notEmpty()
    .withMessage("Start date required")
    .isISO8601()
    .withMessage("Invalid start date"),

  body("endDate")
    .notEmpty()
    .withMessage("End date required")
    .isISO8601()
    .withMessage("Invalid end date"),
];

exports.updateOfferValidation = [
  param("id").isMongoId().withMessage("Invalid offer ID"),
];
