const Enquiry = require("../models/Enquiry");
const {sendWhatsAppMessage} = require("../utils/whatsaap/sendTemplate")
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


    try {
      if (phone) {
        await sendWhatsAppMessage({
          to: phone,
          type: "template",
          templateName: "enquiry_confirmation_user",
          parameters: [
            name,   // {{1}}
            type    // {{2}}
          ]
        });

        console.log("✅ WhatsApp sent to customer");
      }
    } catch (err) {
      console.error("❌ Customer WhatsApp error:", err.message);
    }

    // ============================
    // 📩 WHATSAPP - ADMIN
    // ============================
    try {
      const adminPhone = "916262633309"; // 👈 apna admin number daalo

      await sendWhatsAppMessage({
        to: adminPhone,
        type: "template",
        templateName: "new_enquiry_admin_alert",
        parameters: [
          name,     // {{1}}
          phone,    // {{2}}
          email,    // {{3}}
          type,     // {{4}}
          message   // {{5}}
        ]
      });

      console.log("✅ WhatsApp sent to admin");

    } catch (err) {
      console.error("❌ Admin WhatsApp error:", err.message);
    }


    res.status(201).json({
      success: true,
      message: "Enquiry submitted successfully",
      data: enquiry,
    });
  } catch (error) {
    next(error);
  }
};
