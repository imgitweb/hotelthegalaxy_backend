const MenuVariant = require("../../models/dining/menuVariant.model");

const create = async (req, res, next) => {
  try {
    const variant = await MenuVariant.create(req.body);

    res.status(201).json({
      success: true,
      data: variant,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  create,
};
