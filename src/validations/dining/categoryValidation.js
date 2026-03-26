const { body, param } = require("express-validator");

const createCategoryValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ max: 100 })
    .withMessage("Name too long"),

  body("description").optional().trim(),

  body("image").optional(),

  body("sortOrder").optional(),
];

const updateCategoryValidation = [
  param("id").isMongoId().withMessage("Invalid Category ID"),
  body("name").optional().trim().notEmpty(),
];

module.exports = { createCategoryValidation, updateCategoryValidation };
