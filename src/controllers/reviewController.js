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

    const orderItemIds = orderData.items.map((i) => i.menuItem.toString());

    const reviewDocs = [];

    for (const r of reviews) {
      if (!orderItemIds.includes(r.menuItem)) {
        return res.status(400).json({
          success: false,
          message: "Invalid item review detected",
        });
      }

      const exists = await Review.findOne({
        user: req.user.id,
        order,
        menuItem: r.menuItem,
      });

      if (exists) {
        return res.status(400).json({
          success: false,
          message: "Review already submitted for this item",
        });
      }

      reviewDocs.push({
        user: req.user.id,
        order,
        menuItem: r.menuItem,
        rating: r.rating,
        comment: r.comment || "",
      });
    }

    const createdReviews = await Review.insertMany(reviewDocs);

    res.status(201).json({
      success: true,
      data: createdReviews,
      message: "Reviews submitted successfully",
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
