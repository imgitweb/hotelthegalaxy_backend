const axios = require("axios");
const Setting = require("../models/Setting");

const API_KEY = process.env.GOOGLE_MAPS_API;

const HOTEL_LOCATION = {
  lat: 22.061401,
  lng: 78.94776,
};

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
  console.log("📡 Google Element:", JSON.stringify(element, null, 2));

  if (!element || element.status !== "OK") {
    throw new Error(`Google Maps error: ${element?.status || "No response"}`);
  }

  const travelSeconds =
    element?.duration_in_traffic?.value || element?.duration?.value || 1200;

  const distanceKm = (element?.distance?.value || 0) / 1000;

  console.log(
    `✅ Travel: ${Math.ceil(travelSeconds / 60)} mins | Distance: ${distanceKm.toFixed(1)} km`
  );

  return { travelSeconds, distanceKm };
};

const calculateFare = (distanceKm, settings, subtotal = 0) => {
  if (subtotal >= settings.freeDeliveryAbove) return 0;

  let fare = settings.baseFee + distanceKm * settings.perKmRate;

  if (fare < settings.minCharge) {
    fare = settings.minCharge;
  }

  if (fare > settings.maxCharge) {
    fare = settings.maxCharge;
  }

  return Math.ceil(fare);
};

const calculateETA = async (order) => {
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

    let settings = await Setting.findOne();

    if (!settings) {
      settings = await Setting.create({});
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
    console.error("💥 FULL ERROR:", err.response?.data || err.message);
    throw err;
  }
};

module.exports = calculateETA;