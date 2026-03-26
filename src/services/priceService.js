const Offer = require("../models/Offer");
const getFinalPrice = async (item, type = "item") => {
  const now = new Date();

  const basePrice = item.basePrice ?? item.price ?? 0;

  const query = {
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  };

  if (type === "item") query.items = item._id;
  if (type === "combo") query.combos = item._id;

  const offer = await Offer.findOne(query).lean();
  if (!offer) {
    return {
      basePrice,
      originalPrice: basePrice,
      discountAmount: 0,
      finalPrice: basePrice,
      savings: 0,
      discountLabel: null,
      offer: null,
    };
  }

  let discountAmount = 0;

  if (offer.discountType === "PERCENTAGE") {
    discountAmount = Math.round((basePrice * offer.discountValue) / 100);
  }

  if (offer.discountType === "FLAT") {
    discountAmount = offer.discountValue;
  }

  discountAmount = Math.min(discountAmount, basePrice);

  const finalPrice = Math.max(basePrice - discountAmount, 0);

  const discountLabel =
    offer.discountType === "PERCENTAGE"
      ? `${offer.discountValue}% OFF`
      : `₹${offer.discountValue} OFF`;

  return {
    basePrice,
    originalPrice: basePrice,
    discountAmount,
    finalPrice,
    savings: discountAmount,
    discountLabel,
    offer: {
      _id: offer._id,
      name: offer.name,
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      endDate: offer.endDate,
      image: offer.image,
    },
  };
};

module.exports = { getFinalPrice };
