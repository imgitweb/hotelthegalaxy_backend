const Setting = require("../models/Setting");

exports.getSettings = async (req, res) => {
  let settings = await Setting.findOne();

  if (!settings) {
    settings = await Setting.create({});
  }

  res.json(settings);
};

exports.updateSettings = async (req, res) => {
  let settings = await Setting.findOne();

  if (!settings) {
    settings = await Setting.create(req.body);
  } else {
    settings.baseFee = req.body.baseFee;
    settings.perKmRate = req.body.perKmRate;
    settings.minCharge = req.body.minCharge;
    settings.maxCharge = req.body.maxCharge;
    settings.freeDeliveryAbove = req.body.freeDeliveryAbove;

    await settings.save();
  }

  res.json({
    message: "Settings updated successfully",
    settings,
  });
};