const mongoose = require("mongoose");
const Address = require("../models/User/address");
const axios = require("axios");

const geocodeAddress = async (address) => {
  try {
    console.log("🌍 [GEOCODE] Request:", address);

    const res = await axios.get(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        params: {
          address,
          key: process.env.GOOGLE_MAPS_API,
        },
      },
    );

    if (res.data.status !== "OK") {
      console.log("❌ Geocode Failed:", res.data.status);
      return null;
    }

    const location = res.data.results[0].geometry.location;

    console.log("✅ Coordinates:", location);

    return {
      lat: location.lat,
      lng: location.lng,
    };
  } catch (err) {
    console.error("🔥 Geocode Error:", err.message);
    return null;
  }
};

exports.addAddress = async (req, res, next) => {
  try {
    const { street, landmark, label, isDefault } = req.body;

    if (!street || !landmark) {
      return res.status(400).json({
        success: false,
        message: "Street and landmark are required",
      });
    }

    const fullAddress = `${street}, ${landmark}`;

    const coords = await geocodeAddress(fullAddress);

    if (!coords) {
      return res.status(400).json({
        success: false,
        message: "Invalid address",
      });
    }

    const userId = req.userId || req.riderId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user not found in token",
      });
    }

    if (isDefault) {
      await Address.updateMany(
        { user: userId },
        { $set: { isDefault: false } },
      );
    }

    const address = await Address.create({
      user: userId,
      street,
      landmark,
      label,
      isDefault,

      lat: coords.lat,
      lng: coords.lng,

      location: {
        type: "Point",
        coordinates: [coords.lng, coords.lat],
      },
    });

    console.log("💾 Saved Address:", address);

    res.status(201).json({
      success: true,
      address,
    });
  } catch (err) {
    console.error("🔥 ADD ADDRESS ERROR:", err);
    next(err);
  }
};

exports.getAddresses = async (req, res, next) => {
  try {
    const userId = req.userId || req.riderId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user not found in token",
      });
    }

    const addresses = await Address.find({ user: userId })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: addresses.length,
      addresses,
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteAddress = async (req, res, next) => {
  try {
    const { addressId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid address id",
      });
    }

    const userId = req.userId || req.riderId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user not found in token",
      });
    }

    const address = await Address.findOneAndDelete({
      _id: addressId,
      user: userId,
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Address removed",
    });
  } catch (err) {
    next(err);
  }
};

exports.updateAddress = async (req, res, next) => {
  try {
    const { addressId } = req.params;
    const { street, landmark, label } = req.body;

    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid address id",
      });
    }

    const fullAddress = `${street}, ${landmark}`;

    const coords = await geocodeAddress(fullAddress);

    if (!coords) {
      return res.status(400).json({
        success: false,
        message: "Invalid address",
      });
    }

    const userId = req.userId || req.riderId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user not found in token",
      });
    }

    const address = await Address.findOneAndUpdate(
      {
        _id: addressId,
        user: userId,
      },
      {
        street,
        landmark,
        label,

        lat: coords.lat,
        lng: coords.lng,

        location: {
          type: "Point",
          coordinates: [coords.lng, coords.lat],
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    res.status(200).json({
      success: true,
      address,
    });
  } catch (err) {
    next(err);
  }
};

exports.setDefaultAddress = async (req, res, next) => {
  try {
    const { addressId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid address id",
      });
    }

    const userId = req.userId || req.riderId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user not found in token",
      });
    }

    await Address.updateMany(
      { user: userId },
      { $set: { isDefault: false } },
    );

    const address = await Address.findOneAndUpdate(
      {
        _id: addressId,
        user: userId,
      },
      { isDefault: true },
      { new: true },
    );

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    res.status(200).json({
      success: true,
      address,
    });
  } catch (err) {
    next(err);
  }
};
