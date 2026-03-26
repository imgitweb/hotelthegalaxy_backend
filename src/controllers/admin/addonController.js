const { model } = require("mongoose");
const MenuAddon = require("../../models/dining/menuAddonModel");

const create = async (req, res) => {
  try {
    const addon = await MenuAddon.create(req.body);
    res.status(201).json({ success: true, data: addon });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getAll = async (req, res) => {
  try {
    const addons = await MenuAddon.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: addons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const update = async (req, res) => {
  try {
    const addon = await MenuAddon.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!addon)
      return res.status(404).json({ success: false, message: "Not found" });
    res.status(200).json({ success: true, data: addon });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const remove = async (req, res) => {
  try {
    const addon = await MenuAddon.findByIdAndDelete(req.params.id);
    if (!addon)
      return res.status(404).json({ success: false, message: "Not found" });
    res
      .status(200)
      .json({ success: true, message: "Addon deleted successfully" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  create,
  getAll,
  update,
  remove,
};
