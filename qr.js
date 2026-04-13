const QRCode = require("qrcode");
const fs = require("fs");

const data = "https://www.goodwilledu.in/"; // tera ID

const filePath = "./qr-web-code.png";

QRCode.toFile(filePath, data, {
  color: {
    dark: "#000000",
    light: "#ffffff"
  },
  width: 300
}, function (err) {
  if (err) throw err;
  console.log("✅ QR Code saved:", filePath);
});