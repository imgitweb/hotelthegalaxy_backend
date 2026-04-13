const DeliverySetting = require("../../models/Setting");

// Get settings
exports.getSettings = async (req, res, next) => {
  try {
    let settings = await DeliverySetting.findOne();
    
    // Agar database mein setting nahi hai, to default create karein jisme baseDistance bhi ho
    if (!settings) {
      settings = await DeliverySetting.create({
        baseFee: 30,
        baseDistance: 3, // Default 3 KM
        perKmRate: 10,
        minCharge: 20,
        maxCharge: 200,
        freeDeliveryAbove: 500,
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
    const { baseFee, baseDistance, perKmRate, minCharge, maxCharge, freeDeliveryAbove } = req.body;

    const updatedSettings = await DeliverySetting.findOneAndUpdate(
      {}, 
      {
        baseFee,
        baseDistance, // Naya field update ke liye
        perKmRate,
        minCharge,
        maxCharge,
        freeDeliveryAbove,
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