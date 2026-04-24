const axios = require("axios");
const DeliverySetting = require("../models/Setting"); // Apne model ka sahi path verify kar lein
const addressSchema = require("../models/User/address");

const API_KEY = process.env.GOOGLE_MAPS_API;

const HOTEL_LOCATION = {
  lat: 22.061401,
  lng: 78.94776,
};

// ─── 1. Get Distance using Google Maps API ───
const getDistanceTime = async (origin, destination) => {
  console.log("📍 ORIGIN     :", origin);
  console.log("📍 DESTINATION:", destination);

  if (
    origin?.lat == null ||
    origin?.lng == null ||
    destination?.lat == null ||
    destination?.lng == null
  ) {
    throw new Error("Invalid coordinates — lat/lng missing");
  }

  const res = await axios.get(
    "https://maps.googleapis.com/maps/api/distancematrix/json",
    {
      params: {
        origins: `${origin.lat},${origin.lng}`,
        destinations: `${destination.lat},${destination.lng}`,
        mode: "driving",
        departure_time: "now",
        traffic_model: "best_guess",
        key: API_KEY,
      },
    }
  );

  const element = res?.data?.rows?.[0]?.elements?.[0];
  console.log("📡 Google Element Status:", element?.status);

  if (!element || element.status !== "OK") {
    throw new Error(`Google Maps error: ${element?.status || "No response"}`);
  }

  const travelSeconds =
    element?.duration_in_traffic?.value || element?.duration?.value || 1200;

  const distanceKm = (element?.distance?.value || 0) / 1000;

  console.log(
    `✅ Travel: ${Math.ceil(
      travelSeconds / 60
    )} mins | Distance: ${distanceKm.toFixed(1)} km`
  );

  return { travelSeconds, distanceKm };
};

// ─── 2. Calculate Fare Logic ───
const calculateFare = (distanceKm, settings, subtotal = 0) => {
  // Defensive check in case DB misses some nested fields
  const chargeConfig = settings?.deliveryCharge || {
    isFreeDelivery: false,
    baseDistance: 6,
    baseFee: 30,
    extraPerKmRate: 10,
    minCharge: 20,
    maxCharge: 200,
    freeDeliveryAbove: 500,
  };

  // Free delivery logic
  if (chargeConfig.isFreeDelivery) return 0;
  
  // 🔥 FIX: Check if subtotal is greater than or equal to freeDeliveryAbove
  if (subtotal > 0 && chargeConfig.freeDeliveryAbove && subtotal >= chargeConfig.freeDeliveryAbove) {
    return 0;
  }

  let fare = 0;
  if (distanceKm <= chargeConfig.baseDistance) {
    fare = chargeConfig.baseFee;
  } else {
    // Ceiling lagaya hai taaki 6.2km ho toh 7km ka charge lage
    const extraKm = Math.ceil(distanceKm - chargeConfig.baseDistance);
    fare = chargeConfig.baseFee + (extraKm * chargeConfig.extraPerKmRate);
  }

  if (fare < chargeConfig.minCharge) fare = chargeConfig.minCharge;
  if (fare > chargeConfig.maxCharge) fare = chargeConfig.maxCharge;

  return Math.ceil(fare);
};

// ─── 3. API for Checkout Page ───
module.exports.Data_for_checkout_page = async (req, res, next) => {
  try {
    // 🔥 FIX: Extract subtotal from frontend payload
    const { addressId, subtotal } = req.body;
    console.log("📥 Incoming Request -> Address ID:", addressId, "| Subtotal:", subtotal);

    const address = await addressSchema.findById(addressId).select("lat lng");

    if (!address || !address.lat || !address.lng) {
      return res.status(400).json({ success: false, message: "Invalid address or location missing" });
    }

    const userLocation = {
      lat: Number(address.lat),
      lng: Number(address.lng),
    };

    const { distanceKm } = await getDistanceTime(HOTEL_LOCATION, userLocation);
    
    let settings = await DeliverySetting.findOne();

    // Default fallback agar DB me settings fetch na ho paye
    if (!settings || !settings.deliveryCharge) {
       console.warn("⚠️ Delivery settings missing in DB. Using fallback defaults.");
       settings = {
         maxDeliveryDistance: 10, // Assuming 10km if nothing found
         deliveryCharge: { 
           isFreeDelivery: false, 
           baseDistance: 6, 
           baseFee: 30, 
           extraPerKmRate: 10, 
           minCharge: 20, 
           maxCharge: 200, 
           freeDeliveryAbove: 500 
         }
       };
    }

    // 🛑 OUT OF RANGE CHECK
    if (distanceKm > (settings.maxDeliveryDistance || 10)) {
      return res.status(400).json({
        success: false,
        message: "We not deliver here so far",
        outOfRange: true,
        maxRange: settings.maxDeliveryDistance || 10,
      });
    }

    // 🔥 FIX: Pass subtotal to the fare calculator
    const parsedSubtotal = Number(subtotal) || 0;
    const fare = calculateFare(distanceKm, settings, parsedSubtotal);

    return res.status(200).json({
      message: "Fare calculated successfully",
      success: true,
      fare: fare,
      distance: `${distanceKm.toFixed(1)} km`,
    });
  } catch (error) {
    console.error("❌ Fare Calculation Error:", error.message);
    return res.status(500).json({
      message: "Internal server error calculating fare",
      success: false,
      error: error.message,
    });
  }
};

// ─── 4. Calculate ETA & Final Fare for Order Creation ───
module.exports.calculateETA = async (order) => {
  try {
    const {
      address,
      status,
      prepTimeRemaining = 10,
      prepTime = 20,
      pricing = {},
    } = order;

    if (address?.lat == null || address?.lng == null) {
      throw new Error("User coordinates (address.lat / address.lng) missing");
    }

    const userLocation = {
      lat: Number(address.lat),
      lng: Number(address.lng),
    };

    if (status === "delivered") {
      return { eta: 0, travelMins: 0, distanceKm: 0, fare: 0 };
    }

    const { travelSeconds, distanceKm } = await getDistanceTime(
      HOTEL_LOCATION,
      userLocation
    );

    const travelMins = Math.ceil(travelSeconds / 60);

    let etaMins = 0;

    switch (status) {
      case "pending":
      case "confirmed":
        etaMins = prepTime + travelMins;
        break;
      case "preparing":
        etaMins = prepTimeRemaining + travelMins;
        break;
      case "out_for_delivery":
        etaMins = travelMins;
        break;
      default:
        etaMins = travelMins + prepTimeRemaining;
    }

    const finalEta = Math.max(5, Math.ceil(etaMins));

    let settings = await DeliverySetting.findOne();
    if (!settings || !settings.deliveryCharge) {
        settings = {
          maxDeliveryDistance: 10,
          deliveryCharge: { 
            isFreeDelivery: false, 
            baseDistance: 6, 
            baseFee: 30, 
            extraPerKmRate: 10, 
            minCharge: 20, 
            maxCharge: 200, 
            freeDeliveryAbove: 500 
          }
        };
    }

    const subtotal = pricing?.subtotal || 0;
    const fare = calculateFare(distanceKm, settings, subtotal);

    console.log(
      `🕐 ETA: ${finalEta} mins | 🚚 Fare: ₹${fare} | 📏 Distance: ${distanceKm.toFixed(1)} km`
    );

    return {
      eta: finalEta,
      travelMins,
      distanceKm,
      fare,
    };
  } catch (err) {
    console.error("💥 ETA ERROR:", err.response?.data || err.message);
    throw err;
  }
};