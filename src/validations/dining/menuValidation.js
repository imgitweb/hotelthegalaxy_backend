const { body, param } = require("express-validator");

exports.createMenuValidation = [
  body("name")
    .notEmpty()
    .withMessage("Menu name is required"),

  body("subCategory")
    .notEmpty()
    .withMessage("SubCategory is required")
    .isMongoId()
    .withMessage("Invalid subCategory ID"),

  body("basePrice")
    .notEmpty()
    .withMessage("Base price is required")
    .isFloat({ min: 0 })
    .toFloat(),

  body("taxPercent")
    .optional()
    .isFloat({ min: 0 })
    .toFloat(),

  body("isVeg")
    .optional()
    .toBoolean(),

  body("isJain")
    .optional()
    .toBoolean(),

  body("preparationTime")
    .optional()
    .isInt({ min: 1 })
    .toInt(),
];

exports.updateMenuValidation = [
  param("id").isMongoId().withMessage("Invalid ID"),

  body("name").optional().notEmpty(),
  body("basePrice").optional().isFloat({ min: 0 }).toFloat(),
  body("isVeg").optional().toBoolean(),
  body("preparationTime").optional().isInt({ min: 1 }).toInt(),
];