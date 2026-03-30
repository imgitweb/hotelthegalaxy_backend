const DELIVERY_CONFIG = require("../config/deliveryConfig");

const calculateDeliveryCharge = (distanceKm, orderAmount = 0) => {
  const {
    baseFee,
    perKmRate,
    minCharge,
    maxCharge,
    freeDeliveryAbove,
  } = DELIVERY_CONFIG;

  let charge = baseFee + distanceKm * perKmRate;

  if (orderAmount >= freeDeliveryAbove) {
    charge = 0;
  }

  charge = Math.max(minCharge, charge);
  charge = Math.min(maxCharge, charge);

  return Math.ceil(charge);
};

module.exports = calculateDeliveryCharge;