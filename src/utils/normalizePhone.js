// utils/normalizePhone.js
exports.normalizePhone = (phone) => {
  if (!phone) return phone;

  // remove spaces, dashes
  phone = phone.replace(/[\s-]/g, "");

  // remove + if exists
  if (phone.startsWith("+")) {
    phone = phone.substring(1);
  }

  return phone;
};