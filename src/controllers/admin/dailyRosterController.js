const DailyRoster = require("../../models/dining/DailyRoster");
const mongoose = require("mongoose");

const upsertRoster = async (req, res, next) => {
  try {
    const { dates, items, notes } = req.body;

    // ✅ VALIDATION
    if (!Array.isArray(dates) || !dates.length) {
      return res.status(400).json({
        success: false,
        message: "Dates are required",
      });
    }

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({
        success: false,
        message: "Items are required",
      });
    }

    // ✅ DATE RANGE
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 6);
    maxDate.setHours(0, 0, 0, 0);

    // ✅ FORMAT ITEMS
    const formattedItems = items.map((i) => ({
      id: new mongoose.Types.ObjectId(i.id),
      quantity: Math.max(1, i.quantity || 10),
    }));

    // ✅ BULK OPERATIONS (FAST)
    const operations = dates
      .map((d) => {
        const date = new Date(d);
        date.setHours(0, 0, 0, 0);

        if (date < today || date > maxDate) return null;

        return {
          updateOne: {
            filter: { date },
            update: {
              $set: {
                items: formattedItems,
                notes: notes || "",
                createdBy: req.user?._id,
              },
            },
            upsert: true,
          },
        };
      })
      .filter(Boolean);

    if (!operations.length) {
      return res.status(400).json({
        success: false,
        message: "No valid dates provided",
      });
    }

    await DailyRoster.bulkWrite(operations);

    return res.status(200).json({
      success: true,
      message: "Roster updated successfully",
    });
  } catch (err) {
    next(err);
  }
};

const getRosterByDate = async (req, res, next) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date required",
      });
    }

    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);
    const roster = await DailyRoster.findOne({ date: selectedDate })
  .populate({
    path: "items.id",
    select: "name basePrice images subCategory isVeg isJain isAvailable isDeleted",
    match: {
      isDeleted: false,
      isAvailable: true,
    },
    populate: {
      path: "subCategory",
      select: "name category",
      populate: {
        path: "category",
        select: "name",
      },
    },
  })
  .lean();

    return res.status(200).json({
      success: true,
      data: roster || { items: [] },
    });
  } catch (err) {
    next(err);
  }
};

const getRosterRange = async (req, res, next) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: "Start and end dates required",
      });
    }

    const data = await DailyRoster.find({
      date: {
        $gte: new Date(start),
        $lte: new Date(end),
      },
    })
      .select("date items")
      .lean();

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  upsertRoster,
  getRosterByDate,
  getRosterRange,
};