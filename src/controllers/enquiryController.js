const Enquiry = require("../models/Enquiry");
const {
  sendAdminEnquiryMail,
  sendUserConfirmationMail,
} = require("../services/emailService");

exports.createEnquiry = async (req, res, next) => {
  try {
    const { name, email, phone, type, message } = req.body;

    const enquiry = await Enquiry.create({
      name,
      email,
      phone,
      type,
      message,
    });

    await sendAdminEnquiryMail(enquiry);

    await sendUserConfirmationMail(enquiry);

    res.status(201).json({
      success: true,
      message: "Enquiry submitted successfully",
      data: enquiry,
    });
  } catch (error) {
    next(error);
  }
};
