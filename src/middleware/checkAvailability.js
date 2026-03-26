const Availability = require("../models/availabilityModel");

module.exports = async (req, res, next) => {
  try {
    const config = await Availability.findOne();

    if (!config || !config.isOrderingEnabled) {
      return res.status(403).json({
        success: false,
        message: "Online ordering is disabled",
      });
    }

    if (config.isTemporarilyClosed) {
      return res.status(403).json({
        success: false,
        message: config.reason || "Temporarily closed",
      });
    }

    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);

    if (
      currentTime < config.kitchenStartTime ||
      currentTime > config.kitchenEndTime
    ) {
      return res.status(403).json({
        success: false,
        message: "Kitchen is closed",
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};