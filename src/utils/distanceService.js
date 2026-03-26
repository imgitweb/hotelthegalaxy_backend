const axios = require("axios");

const API_KEY = process.env.GOOGLE_MAPS_API;

const getDistanceKm = async (origin, destination) => {
  if (
    origin?.lat == null ||
    origin?.lng == null ||
    destination?.lat == null ||
    destination?.lng == null
  ) {
    throw new Error("Invalid coordinates");
  }

  const res = await axios.get(
    "https://maps.googleapis.com/maps/api/distancematrix/json",
    {
      params: {
        origins: `${origin.lat},${origin.lng}`,
        destinations: `${destination.lat},${destination.lng}`,
        mode: "driving",
        key: API_KEY,
      },
    }
  );

  const element = res?.data?.rows?.[0]?.elements?.[0];

  if (!element || element.status !== "OK") {
    throw new Error("Distance API failed");
  }

  const distanceKm = (element.distance.value || 0) / 1000;

  return distanceKm;
};

module.exports = getDistanceKm;