const { body } = require("express-validator");

exports.createEnquiryValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2-100 characters")
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage("Name can only contain letters"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email required")
    .isEmail()
    .withMessage("Enter valid email")
    .normalizeEmail(),

  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number required")
    .matches(/^[6-9]\d{9}$/)
    .withMessage("Phone must be valid 10 digit Indian number"),

  body("type")
    .notEmpty()
    .withMessage("Enquiry type required")
    .isIn([
      "Hotel Booking",
      "Restaurant Reservation",
      "Buffet Enquiry",
      "Banquet Hall",
      "Other",
    ])
    .withMessage("Invalid enquiry type"),

  body("message")
    .trim()
    .notEmpty()
    .withMessage("Message required")
    .isLength({ min: 10, max: 2000 })
    .withMessage("Message must be between 10 and 2000 characters"),
];
