const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
exports.sendPasswordResetMail = async ({ email, name, resetURL }) => {
  const content = `
    <h2 style="color:#1a202c;">Password Reset Request</h2>
    <p>Hello <strong>${name || "Admin"}</strong>,</p>
    <p>We received a request to reset your password.</p>

    <div style="text-align:center; margin:30px 0;">
      <a href="${resetURL}" 
         style="display:inline-block; padding:12px 24px; background:#C6A45C; color:#fff; border-radius:6px; text-decoration:none;">
        Reset Password
      </a>
    </div>

    <p>This link will expire in <strong>10 minutes</strong>.</p>
    <p>If you did not request this, please ignore this email.</p>

    <p>— Hotel Galaxy Team</p>
  `;

  await transporter.sendMail({
    from: `"Hotel Galaxy Security" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Reset Your Password",
    html: emailWrapper(content),
  });
};
const emailWrapper = (content) => `
  <div style="background-color: #f4f4f7; padding: 20px 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <tr>
        <td style="padding: 30px; background-color: #C6A45C; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Hotel Galaxy</h1>
        </td>
      </tr>
      <tr>
        <td style="padding: 30px; line-height: 1.6;">
          ${content}
        </td>
      </tr>
      <tr>
        <td style="padding: 20px; background-color: #f8fafc; text-align: center; font-size: 12px; color: #64748b;">
          &copy; ${new Date().getFullYear()} Hotel Galaxy. All rights reserved. <br/>
          This is an automated message, please do not reply directly.
        </td>
      </tr>
    </table>
  </div>
`;

exports.sendAdminEnquiryMail = async (data) => {
  const { name, email, phone, type, message } = data;
  const content = `
    <h2 style="color: #1a202c; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">New Enquiry Received</h2>
    <p style="margin: 10px 0;"><strong>Type:</strong> <span style="background: #edf2f7; padding: 2px 8px; border-radius: 4px;">${type}</span></p>
    <table width="100%" style="margin-top: 20px; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;"><strong>Name:</strong></td><td>${name}</td></tr>
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;"><strong>Email:</strong></td><td>${email}</td></tr>
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;"><strong>Phone:</strong></td><td>${phone}</td></tr>
    </table>
    <div style="margin-top: 25px; padding: 15px; background: #fdf2f2; border-left: 4px solid #C6A45C;">
      <h4 style="margin: 0 0 10px 0;">Message:</h4>
      <p style="margin: 0;">${message}</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Hotel Galaxy Website" <${process.env.SMTP_USER}>`,
    to: process.env.ADMIN_EMAIL,
    subject: `New Enquiry - ${type}`,
    html: emailWrapper(content),
  });
};

exports.sendUserConfirmationMail = async (data) => {
  const { name, email } = data;
  const content = `
    <h2 style="color: #2d3748;">Hello ${name},</h2>
    <p>Thank you for reaching out to <strong>Hotel Galaxy</strong>. We have received your enquiry and our team is currently reviewing it.</p>
    <div style="text-align: center; margin: 30px 0;">
      <div style="display: inline-block; padding: 12px 24px; background-color: #C6A45C; color: #fff; border-radius: 5px; text-decoration: none;">Request Received</div>
    </div>
    <p>We usually respond within 24 hours. If your request is urgent, please call our front desk.</p>
    <p>Best Regards,<br/><strong>Management Team</strong></p>
  `;

  await transporter.sendMail({
    from: `"Hotel Galaxy" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "We received your enquiry",
    html: emailWrapper(content),
  });
};

exports.sendAdminNewsletterMail = async (email) => {
  const content = `
    <h2 style="color: #C6A45C;">New Subscriber!</h2>
    <p>A new user has joined your mailing list.</p>
    <div style="padding: 20px; background: #f0fff4; border: 1px solid #c6f6d5; text-align: center; font-size: 18px;">
      <strong>Email:</strong> ${email}
    </div>
  `;

  await transporter.sendMail({
    from: `"Hotel Galaxy Website" <${process.env.SMTP_USER}>`,
    to: process.env.ADMIN_EMAIL,
    subject: "New Newsletter Subscriber",
    html: emailWrapper(content),
  });
};

exports.sendNewsletterWelcomeMail = async (email) => {
  const content = `
    <h2 style="color: #C6A45C; text-align: center;">Welcome to the Club!</h2>
    <p style="text-align: center;">You have successfully subscribed to the <strong>Hotel Galaxy</strong> newsletter.</p>
    <p style="text-align: center; color: #718096;">Get ready for exclusive deals, early booking discounts, and luxury travel tips delivered straight to your inbox.</p>
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 25px 0;" />
    <p style="font-size: 13px; text-align: center; color: #a0aec0;">You are receiving this because you signed up on our website.</p>
  `;

  await transporter.sendMail({
    from: `"Hotel Galaxy" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Welcome to our Newsletter",
    html: emailWrapper(content),
  });
};
