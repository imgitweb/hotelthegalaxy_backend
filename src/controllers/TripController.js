const Trip = require("../models/TripModel");
const Order = require("../models/User/ordersModel");
const Rider = require("../models/rider.model");
const { generateOTPMap } = require("../utils/otp");
const axios = require("axios");

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API;

const HOTEL_LOCATION = {
 lat: 22.061401,
  lng: 78.94776,
};

const getDistanceKm = async (destination) => {
  try {
    const coord = destination?.lat != null && destination?.lng != null
      ? destination
      : destination?.location?.coordinates?.length === 2
      ? { lat: destination.location.coordinates[1], lng: destination.location.coordinates[0] }
      : null;

    if (!coord?.lat || !coord?.lng) return 0;

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${HOTEL_LOCATION.lat},${HOTEL_LOCATION.lng}&destinations=${coord.lat},${coord.lng}&key=${GOOGLE_API_KEY}`;

    const res = await axios.get(url);
    const element = res.data.rows[0].elements[0];

    if (element.status === "OK") {
      return element.distance.value / 1000;
    }

    return 0;
  } catch {
    return 0;
  }
};

exports.createTrip = async (req, res, next) => {
  try {
    const { orderIds, riderId } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ success: false, message: "Please select at least 1 order" });
    }

    if (!riderId) {
      return res.status(400).json({ success: false, message: "Rider ID is required" });
    }

    const rider = await Rider.findById(riderId);
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }

    if (rider.status !== "Available") {
      return res.status(400).json({ success: false, message: `Rider is ${rider.status}. Please select an available rider.` });
    }

    const orders = await Order.find({ _id: { $in: orderIds } });
    if (orders.length !== orderIds.length) {
      return res.status(400).json({ success: false, message: "Some orders not found" });
    }

    const allPreparing = orders.every((o) => o.status === "preparing");
    if (!allPreparing) {
      return res.status(400).json({ success: false, message: "All orders must be in 'preparing' status" });
    }

    const otpMap = generateOTPMap(orderIds);

    const distances = await Promise.all(
      orders.map((o) =>
        getDistanceKm(o.address)
      )
    );

    const tripId = `TRIP_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const totalEarnings = orders.reduce(
      (sum, o) => sum + (o.pricing?.total || o.totalAmount || 0),
      0
    );

    const trip = await Trip.create({
      tripId,
      riderId,
      orderIds,
      status: "Active",
      orderOtps: otpMap,
      totalEarnings,
    });

    const bulkOps = orders.map((order, index) => ({
      updateOne: {
        filter: { _id: order._id },
        update: {
          status: "out_for_delivery",
          rider: riderId,
          tripId: trip._id,
          distanceKm: distances[index],
          "deliveryOTP.code": otpMap[order._id.toString()],
          "deliveryOTP.generatedAt": new Date(),
        },
      },
    }));

    await Order.bulkWrite(bulkOps);

    await Rider.findByIdAndUpdate(riderId, {
      status: "On-Trip",
      currentTripId: trip._id,
    });

    return res.status(201).json({
      success: true,
      message: "Trip created and assigned successfully",
      data: {
        trip,
        otpMap,
        ordersCount: orderIds.length,
        totalAmount: totalEarnings,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getTrips = async (req, res, next) => {
  try {
    const { status, riderId, startDate, endDate } = req.query;

    let query = {};

    if (status) query.status = status;
    if (riderId) query.riderId = riderId;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const trips = await Trip.find(query)
      .populate("riderId", "name phone vehicleNumber")
      .populate("orderIds", "customer.name customer.phone status distanceKm")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: trips.length,
      data: trips,
    });
  } catch (err) {
    next(err);
  }
};

exports.getTripDetails = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.tripId)
      .populate("riderId", "name phone vehicleNumber status")
      .populate("orderIds");

    if (!trip) {
      return res.status(404).json({ success: false, message: "Trip not found" });
    }

    res.json({
      success: true,
      data: trip,
    });
  } catch (err) {
    next(err);
  }
};

exports.cancelTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.tripId);

    if (!trip) {
      return res.status(404).json({ success: false, message: "Trip not found" });
    }

    if (trip.status === "Completed") {
      return res.status(400).json({ success: false, message: "Cannot cancel a completed trip" });
    }

    trip.status = "Cancelled";
    await trip.save();

    await Order.updateMany(
      { _id: { $in: trip.orderIds } },
      {
        status: "Pending",
        rider: null,
        tripId: null,
        distanceKm: 0,
      }
    );

    await Rider.findByIdAndUpdate(trip.riderId, {
      status: "Available",
      currentTripId: null,
    });

    res.json({
      success: true,
      message: "Trip cancelled successfully",
      data: trip,
    });
  } catch (err) {
    next(err);
  }
};