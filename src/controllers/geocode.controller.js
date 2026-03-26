const geocodeAddress = require("../utils/geocode");

exports.getLatLng = async (req, res, next) => {
  try {
    const { address } = req.query;

    console.log("➡️ [API HIT] /api/geocode/latlng");
    console.log("📥 Query Params:", req.query);

    if (!address) {
      console.warn("⚠️ Address missing in request");
      return res.status(400).json({
        success: false,
        message: "Address is required",
      });
    }

    const coords = await geocodeAddress(address);

    console.log("📤 Sending response:", coords);

    res.json({
      success: true,
      data: coords,
    });
  } catch (err) {
    console.error("🚨 Controller Error:", err.message);
    next(err);
  }
};
