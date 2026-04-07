const Offer = require("../models/Offer");

exports.getOffers = async (req, res) => {
  const offers = await Offer.find().sort({ createdAt: -1 });

  res.json({
    success: true,
    data: offers,
  });
};

exports.createOffer = async (req, res) => {
  const offer = await Offer.create(req.body);

  res.status(201).json({
    success: true,
    data: offer,
  });
};

exports.updateOffer = async (req, res) => {
  const offer = await Offer.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );

  res.json({
    success: true,
    data: offer,
  });
};

exports.deleteOffer = async (req, res) => {
  await Offer.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: "Offer deleted",
  });
};