const crypto = require("crypto");

exports.generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

exports.hashOTP = (otp) =>
  crypto.createHash("sha256").update(otp).digest("hex");

exports.generateOTPMap = (orderIds) => {
  const otpMap = {};
  orderIds.forEach(orderId => {
    otpMap[orderId.toString()] = Math.floor(1000 + Math.random() * 9000).toString();
  });
  return otpMap;
};
