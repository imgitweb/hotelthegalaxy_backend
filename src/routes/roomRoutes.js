const express = require("express");
const router = express.Router();

const roomController = require("../controllers/roomController");
const upload = require("../config/multer");

// 🔥 CREATE ROOM (MULTIPLE IMAGES)
router.post(
  "/",
  upload.array("images", 5),
  roomController.createRoom
);

// 🔥 GET ALL ROOMS
router.get("/", roomController.getRooms);

// 🔥 GET SINGLE ROOM
router.get("/:id", roomController.getRoomById);

// 🔥 UPDATE ROOM
router.put(
  "/:id",
  upload.array("images", 5),
  roomController.updateRoom
);

// 🔥 DELETE ROOM
router.delete("/:id", roomController.deleteRoom);

module.exports = router;


