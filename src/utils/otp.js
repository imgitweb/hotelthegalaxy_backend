const crypto = require("crypto");

exports.generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

exports.hashOTP = (otp) =>
  crypto.createHash("sha256").update(otp).digest("hex");
