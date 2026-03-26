const { body, param } = require("express-validator");

exports.createSubCategoryValidation = [
  body("name")
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ max: 100 }),

  body("category")
    .notEmpty()
    .withMessage("Category is required")
    .isMongoId()
    .withMessage("Invalid category ID"),
];

exports.updateSubCategoryValidation = [
  param("id").isMongoId().withMessage("Invalid ID"),

  body("name")
    .optional()
    .isLength({ max: 100 }),

  body("category")
    .optional()
    .isMongoId()
    .withMessage("Invalid category ID"),
];

exports.idValidation = [
  param("id").isMongoId().withMessage("Invalid ID"),
];