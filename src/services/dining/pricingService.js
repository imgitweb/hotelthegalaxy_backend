const MenuItem = require("../../models/dining/menuItemmodel");
const MenuVariant = require("../../models/dining/menuVariant.model");
const MenuAddon = require("../../models/dining/menuAddonmodel");
const Offer = require("../../models/dining/offer.model");
const { AppError } = require("../../middleware/errorHandler");

class PricingService {
  static async calculatePrice({
    menuItemId,
    variantId,
    addonIds = [],
    quantity = 1,
  }) {
    const menuItem = await MenuItem.findById(menuItemId);

    if (!menuItem || !menuItem.isAvailable) {
      throw new AppError("Menu item not available", 400);
    }

    let basePrice = menuItem.basePrice;

    let variantSnapshot = null;

    if (variantId) {
      const variant = await MenuVariant.findById(variantId);

      if (!variant || !variant.isAvailable) {
        throw new AppError("Variant not available", 400);
      }

      basePrice = variant.price;

      variantSnapshot = {
        id: variant._id,
        name: variant.name,
        price: variant.price,
      };
    }

    let addonTotal = 0;
    let addonSnapshot = [];

    if (addonIds.length) {
      const addons = await MenuAddon.find({
        _id: { $in: addonIds },
        isActive: true,
      });

      addons.forEach((addon) => {
        addonTotal += addon.price;

        addonSnapshot.push({
          id: addon._id,
          name: addon.name,
          price: addon.price,
        });
      });
    }

    let itemPrice = basePrice + addonTotal;

    const now = new Date();

    const offers = await Offer.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });

    let discount = 0;

    offers.forEach((offer) => {
      if (offer.type === "FLAT") {
        discount += offer.discountValue;
      }

      if (offer.type === "PERCENTAGE") {
        discount += (itemPrice * offer.discountValue) / 100;
      }
    });

    if (discount > itemPrice) discount = itemPrice;

    const tax = itemPrice * (menuItem.taxPercent / 100);

    const finalUnitPrice = itemPrice - discount + tax;

    return {
      unitPrice: finalUnitPrice,
      quantity,
      subtotal: finalUnitPrice * quantity,
      variantSnapshot,
      addonSnapshot,
      discount,
      tax,
    };
  }
}

module.exports = PricingService;
