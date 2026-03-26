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
    const update = req.body;

    let config = await Availability.findOne();

    if (!config) {
      config = await Availability.create({});
    }

    Object.assign(config, update);

    await config.save();

    res.status(200).json({
      success: true,
      message: "Updated successfully",
      data: config,
    });
  } catch (error) {
    next(error);
  }
};