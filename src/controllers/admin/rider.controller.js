const Rider = require("../../models/rider.model");

exports.createRider = async (req, res, next) => {
  try {
    const rider = await Rider.create(req.body);

    res.status(201).json({
      success: true,
      data: rider,
    });
  } catch (err) {
    next(err);
  }
};

exports.getRiders = async (req, res, next) => {
  try {
    const riders = await Rider.find();

    res.json({
      success: true,
      data: riders,
    });
  } catch (err) {
    next(err);
  }
};

exports.updateRider = async (req, res, next) => {
  try {
    const rider = await Rider.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    res.json({
      success: true,
      data: rider,
    });
  } catch (err) {
    next(err);
  }
};
