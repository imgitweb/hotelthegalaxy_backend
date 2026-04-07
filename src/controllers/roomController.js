const Room = require("../models/rooms");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// 🔥 CREATE ROOM
exports.createRoom = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least 1 image required",
      });
    }

    if (req.body.amenities && typeof req.body.amenities === "string") {
      req.body.amenities = req.body.amenities.split(",");
    }

    // 🔥 number fix
    if (req.body.price) req.body.price = Number(req.body.price);
    if (req.body.maxGuests) req.body.maxGuests = Number(req.body.maxGuests);
    if (req.body.bedCount) req.body.bedCount = Number(req.body.bedCount);

    const images = req.files.map(
      (file) => `/uploads/rooms/${file.filename}`
    );

    const data = { ...req.body };

    // 🔥 CATEGORY AUTO
    if (data.roomType === "Suite") data.category = "Suite";
    else if (data.roomType === "Deluxe") data.category = "Deluxe";
    else data.category = "Deluxe";

    const room = await Room.create({
      ...data,
      images,
    });

    res.status(201).json({
      success: true,
      data: room,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// 🔥 GET ALL ROOMS
exports.getRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ isActive: true }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      data: rooms,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// 🔥 GET SINGLE ROOM
exports.getRoomById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    const room = await Room.findById(req.params.id);

    if (!room || !room.isActive) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    res.json({
      success: true,
      data: room,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// 🔥 UPDATE ROOM
exports.updateRoom = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // ✅ number conversion
    ["price", "maxGuests", "bedCount"].forEach((field) => {
      if (req.body[field]) req.body[field] = Number(req.body[field]);
    });

    // ✅ amenities fix
    if (typeof req.body.amenities === "string") {
      req.body.amenities = req.body.amenities.split(",");
    }

    // ✅ category auto
    if (req.body.roomType) {
      req.body.category =
        req.body.roomType === "Suite" ? "Suite" : "Deluxe";
    }

    // ✅ slug update
    if (req.body.name) {
      const baseSlug = req.body.name
        .toLowerCase()
        .replace(/ /g, "-")
        .replace(/[^\w-]+/g, "");

      req.body.slug = `${baseSlug}-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 6)}`;
    }

    let images = room.images;

    // ✅ image replace
    if (req.files && req.files.length > 0) {
      // delete old
      room.images.forEach((img) => {
        const imgPath = path.join("public", img);
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      });

      images = req.files.map(
        (file) => `/uploads/rooms/${file.filename}`
      );
    }

    const updatedRoom = await Room.findByIdAndUpdate(
      id,
      {
        ...req.body,
        images,
      },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: updatedRoom,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// 🔥 SOFT DELETE
exports.deleteRoom = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    room.isActive = false;
    await room.save();

    res.json({
      success: true,
      message: "Room soft deleted successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.updateRoomStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["available", "booked", "maintenance"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const room = await Room.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    res.json({
      success: true,
      data: room,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
