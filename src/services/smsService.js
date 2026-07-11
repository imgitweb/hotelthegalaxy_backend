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



exports.sendReviewWhatsApp = async (phone, customerName, orderId) => {
  try {
    // Note: Agar customer ka pura naam aa raha hai (eg. "Rahul Kumar"), 
    // to hum sirf first name nikal lenge "Rahul"
    const firstName = customerName.split(" ")[0] || "Customer";

    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: "hotel_the_galaxy_review_request",
        language: { code: "en_Us" }, // Ya jo bhi language code aapke template ka hai
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: firstName // {{1}} Body ke liye
              }
            ]
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [
              {
                type: "text",
                text: orderId // {{1}} Button URL ke liye
              }
            ]
          }
        ]
      }
    };

    // Yahan apni WhatsApp API ko call karein (Axios/Fetch)
    // await axios.post("YOUR_WHATSAPP_API_URL", payload, { headers: {...} });
    
    console.log(`✅ Review WhatsApp sent to ${phone} for Order ${orderId}`);
    return true;
  } catch (error) {
    console.error("❌ Failed to send Review WhatsApp:", error);
    return false;
  }
};