const Rider = require("../../models/rider.model");
const bcrypt = require("bcryptjs");

const generatePassword = () => {
  return Math.random().toString(36).slice(-8);
};

exports.createRider = async (req, res, next) => {
  try {
    const { name, phone, vehicleNumber } = req.body;

    // Check if rider already exists
    const existingRider = await Rider.findOne({ phone });
    if (existingRider) {
      return res.status(400).json({
        success: false,
        message: "Rider with this phone number already exists",
      });
    }

    // Generate temporary password
    const tempPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const rider = await Rider.create({
      name,
      phone,
      vehicleNumber,
      password: hashedPassword,
    });

    res.status(201).json({
      success: true,
      message: "Rider created successfully",
      data: {
        rider: {
          _id: rider._id,
          name: rider.name,
          phone: rider.phone,
          vehicleNumber: rider.vehicleNumber,
          status: rider.status,
        },
        tempPassword, // Remove this in production - for development only
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getRiders = async (req, res, next) => {
  try {
    const riders = await Rider.find()
      .select("name phone vehicleNumber status isActive currentTripId")
      .sort({ createdAt: -1 });

    res.json({ 
      success: true, 
      count: riders.length,
      data: riders 
    });
  } catch (err) {
    next(err);
  }
};

exports.updateRider = async (req, res, next) => {
  try {
    const rider = await Rider.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!rider) {
      return res
        .status(404)
        .json({ success: false, message: "Rider not found" });
    }

    res.json({ success: true, data: rider });
  } catch (err) {
    next(err);
  }
};