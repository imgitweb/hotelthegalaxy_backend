const Order = require("../models/User/ordersModel");
const Review = require("../models/reviewModel");

exports.createReview = async (req, res, next) => {
  try {
    const { order, reviews } = req.body;

    if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No reviews provided",
      });
    }

    const orderData = await Order.findById(order);

    if (!orderData) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const orderItemIds = orderData.items.map(
      (i) => i?.menuItem?.toString() || i?.combo?.toString(),
    );

    for (const r of reviews) {
      if (!r.menuItem || !r.rating) {
        return res.status(400).json({
          success: false,
          message: "Invalid review data",
        });
      }

      if (!orderItemIds.includes(r.menuItem)) {
        return res.status(400).json({
          success: false,
          message: "Invalid item review detected",
        });
      }
    }

    const operations = reviews.map((r) => ({
      updateOne: {
        filter: {
          user: req.user.id,
          order,
          menuItem: r.menuItem,
        },
        update: {
          $set: {
            rating: r.rating,
            comment: r.comment || "",
          },
        },
        upsert: true,
      },
    }));

    await Review.bulkWrite(operations,{ordered : false});

    return res.status(200).json({
      success: true,
      message: "Reviews saved successfully",
    });
  } catch (error) {
    next(error);
  }
};

exports.getReviewByOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const reviews = await Review.find({
      order: orderId,
      user: req.user.id,
    })
      .populate("menuItem", "name")
      .lean();

    res.status(200).json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    next(error);
  }
};
