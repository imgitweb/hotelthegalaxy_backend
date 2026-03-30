const axios = require("axios");

const API_KEY = process.env.GOOGLE_MAPS_API;

const getDistanceKm = async (origin, destination) => {
  try {
    if (
      origin?.lat == null ||
      origin?.lng == null ||
      destination?.lat == null ||
      destination?.lng == null
    ) {
      console.log("Invalid coordinates");
      return 0;
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
      console.log("Distance API failed:", element?.status);
      return 0; 
    }

    return (element.distance.value || 0) / 1000;
  } catch (err) {
    console.log("Distance Error:", err.message);
    return 0;
  }
};

module.exports = getDistanceKm;