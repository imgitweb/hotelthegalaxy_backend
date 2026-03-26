const router = require("express").Router();

const enquiryController = require("../controllers/enquiryController");
const { createEnquiryValidator } = require("../validations/enquiry/enquiryValidator");
const validateRequest = require("../middleware/validate");

router.post(
  "/",
  createEnquiryValidator,
  validateRequest,
  enquiryController.createEnquiry,
);

module.exports = router;
