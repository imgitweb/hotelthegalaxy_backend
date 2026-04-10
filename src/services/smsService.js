const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

exports.sendOTP = async (phone, otp) => {
  try {
    // BYPASS MODE
    if (process.env.SMS_MODE !== "twilio") {
      console.log("⚠️ SMS BYPASS MODE");
      console.log(`📩 OTP for ${phone}: ${otp}`);
      return { success: true, bypass: true };
    }

    const message = await client.messages.create({
      body: `Your OTP is ${otp}. Valid for 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: `+91${phone}`,
    });

    console.log("✅ SMS Sent SID:", message.sid);

    return { success: true };
  } catch (err) {
    console.error("❌ Twilio Error Details:", err);
    console.error("❌ Twilio Error Code:", err.code);
    console.error("❌ Twilio Error:", err.message);

    //  fallback even if Twilio fails
    console.log("⚠️ Falling back to BYPASS MODE");
    console.log(`📩 OTP for ${phone}: ${otp}`);

    return { success: true, bypass: true };
  }
};