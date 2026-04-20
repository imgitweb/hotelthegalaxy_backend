const DeliverySetting = require("../../models/Setting"); // Ensure correct path to your model

// Get settings
exports.getSettings = async (req, res, next) => {
  try {
    let settings = await DeliverySetting.findOne();
    
    // Agar database mein setting nahi hai, to naye schema ke default fields ke sath create karein
    if (!settings) {
      settings = await DeliverySetting.create({
        maxDeliveryDistance: 6,
        deliveryCharge: {
          isFreeDelivery: false,
          baseDistance: 5,
          baseFee: 30,
          extraPerKmRate: 10,
          minCharge: 20,
          maxCharge: 200,
          freeDeliveryAbove: 500,
        },
        gst: {
          foodGSTPercent: 5,
          deliveryGSTPercent: 5,
        }
      });
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Error fetching delivery settings:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update settings
exports.updateSettings = async (req, res, next) => {
  try {
    // Nested data ko destructure kar rahe hain
    const { maxDeliveryDistance, deliveryCharge, gst } = req.body;

    const updatedSettings = await DeliverySetting.findOneAndUpdate(
      {}, 
      {
        maxDeliveryDistance,
        deliveryCharge,
        gst
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Delivery settings updated successfully",
      data: updatedSettings,
    });
  } catch (error) {
    console.error("Error updating delivery settings:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};