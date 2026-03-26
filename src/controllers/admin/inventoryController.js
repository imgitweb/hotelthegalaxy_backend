const InventoryService = require("../../services/dining/inventory.service");

const getAll = async (req, res, next) => {
  try {
    const data = await InventoryService.getAll();

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

const getLowStock = async (req, res, next) => {
  try {
    const data = await InventoryService.getLowStock();

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

const getByMenuItem = async (req, res, next) => {
  try {
    const data = await InventoryService.getByMenuItem(req.params.menuItemId);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

const restock = async (req, res, next) => {
  try {
    const data = await InventoryService.restock(
      req.params.menuItemId,
      Number(req.body.quantity),
    );

    res.json({
      success: true,
      message: "Stock updated successfully",
      data,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  getLowStock,
  getByMenuItem,
  restock,
};
