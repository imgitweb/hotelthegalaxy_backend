const Subscriber = require("../models/subscriberModel");
const {
  sendAdminNewsletterMail,
  sendNewsletterWelcomeMail,
} = require("../services/emailService");

exports.subscribeNewsletter = async (req, res) => {
  try {
    let { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    email = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    const existing = await Subscriber.findOne({ email });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Email already subscribed",
      });
    }

    const subscriber = await Subscriber.create({ email });

    try {
      await sendAdminNewsletterMail(email);
      await sendNewsletterWelcomeMail(email);
    } catch (mailError) {
      console.error("Newsletter mail error:", mailError);
    }

    return res.status(201).json({
      success: true,
      message: "Subscribed successfully",
      data: subscriber,
    });
  } catch (error) {
    console.error("Newsletter subscription error:", error);

    return res.status(500).json({
      success: false,
      message: "Subscription failed",
    });
  }
};
