const geocodeAddress = async (address) => {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json`;

    const res = await axios.get(url, {
      params: {
        address,
        key: process.env.GOOGLE_MAPS_API,
      },
    });

    if (res.data.status === "OK") {
      const location = res.data.results[0].geometry.location;

      return {
        lat: location.lat,
        lng: location.lng,
      };
    }

    return null;
  } catch (err) {
    console.error("Geocode error:", err.message);
    return null;
  }
};

module.exports = geocodeAddress;
