const Availability = require("../models/availabilityModel");

// GET
exports.getAvailability = async (req, res, next) => {
  try {
    let config = await Availability.findOne();

    if (!config) {
      config = await Availability.create({});
    }

    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
};

// UPDATE (ADMIN)
exports.updateAvailability = async (req, res, next) => {
  try {
    // Destructure only allowed fields
    const { 
      isOrderingEnabled, 
      isWhatsappOrderingEnabled, // Added new field here
      kitchenStartTime, 
      kitchenEndTime, 
      isTemporarilyClosed, 
      reason 
    } = req.body;

    let config = await Availability.findOne();

    if (!config) {
      config = await Availability.create({});
    }

    // Assign only valid updates
    if (isOrderingEnabled !== undefined) config.isOrderingEnabled = isOrderingEnabled;
    if (isWhatsappOrderingEnabled !== undefined) config.isWhatsappOrderingEnabled = isWhatsappOrderingEnabled;
    if (kitchenStartTime !== undefined) config.kitchenStartTime = kitchenStartTime;
    if (kitchenEndTime !== undefined) config.kitchenEndTime = kitchenEndTime;
    if (isTemporarilyClosed !== undefined) config.isTemporarilyClosed = isTemporarilyClosed;
    if (reason !== undefined) config.reason = reason;

    await config.save();

    res.status(200).json({
      success: true,
      message: "Availability updated successfully",
      data: config,
    });
  } catch (error) {
    next(error);
  }
};