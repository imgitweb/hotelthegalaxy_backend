const express = require("express");
const router = express.Router();
const roomController = require("../controllers/roomController");
const upload = require("../config/multer");
const  {adminAuth,authorizeRoles} = require("../middleware/adminAuth")


router.use(adminAuth);
router.use(authorizeRoles("admin"));
router.post(
  "/",
  upload.array("images", 5),
  roomController.createRoom
);
router.get("/", roomController.getRooms);
router.get("/:id", roomController.getRoomById);
router.put(
  "/:id",
  upload.array("images", 5),
  roomController.updateRoom
);
router.delete("/:id", roomController.deleteRoom);
router.patch("/:id/status", roomController.updateRoomStatus);
module.exports = router;
