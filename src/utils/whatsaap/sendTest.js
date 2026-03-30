const axios = require("axios");
// require("dotenv").config();



async function sendTemplateMessage() {
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/messages`;

    const otp = "123456"; // ✅ string (important)

    const payload = {
      messaging_product: "whatsapp",
      to: "917223885563", // ✅ with country code
      type: "template",
      template: {
        name: "hotel_galaxy_otp", // ✅ exact template name
        language: { code: "en_IN" }, // ⚠️ match Meta language
        components: [
          // ✅ BODY PARAM ({{1}})
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: otp
              }
            ]
          },
          // ✅ COPY CODE BUTTON PARAM (REQUIRED)
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [
              {
                type: "text",
                text: otp
              }
            ]
          }
        ]
      }
    };

    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    console.log("✅ OTP Sent Successfully!");
    console.log(res.data);

  } catch (error) {
    console.error(
      "❌ Error:",
      JSON.stringify(error.response?.data || error.message, null, 2)
    );
  }
}

// ▶️ RUN
sendTemplateMessage();

