import express from "express";
import multer from "multer";
import { markAttendance } from "../controllers/attendanceController.js";
// import { verifyStaffToken } from "../middlewares/authMiddleware.js"; // अगर आपका auth middleware है

const router = express.Router();

// Multer Setup - Photo अपलोड के लिए
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // सुनिश्चित करें कि backend में 'uploads' नाम का खाली फ़ोल्डर बना हो
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

// POST Route
router.post(
  "/mark-attendance",
  // verifyStaffToken, // (अपना auth middleware यहाँ लगा लें)
  upload.single("photo"), // Frontend से 'photo' नाम से आ रही इमेज 
  markAttendance
);

module.exports = router;