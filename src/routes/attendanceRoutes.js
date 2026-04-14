// import express from "express";
// import multer from "multer";
// import { markAttendance } from "../controllers/attendanceController.js";
// // import { verifyStaffToken } from "../middlewares/authMiddleware.js"; // अगर आपका auth middleware है

// const router = express.Router();

// // Multer Setup - Photo अपलोड के लिए
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, "uploads/"); // सुनिश्चित करें कि backend में 'uploads' नाम का खाली फ़ोल्डर बना हो
//   },
//   filename: function (req, file, cb) {
//     const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
//     cb(null, uniqueSuffix + "-" + file.originalname);
//   },
// });

// const upload = multer({ storage: storage });

// // POST Route
// router.post(
//   "/mark-attendance",
//   // verifyStaffToken, // (अपना auth middleware यहाँ लगा लें)
//   upload.single("photo"), // Frontend से 'photo' नाम से आ रही इमेज 
//   markAttendance
// );

// module.exports = router;


// ─── routes/attendanceRoutes.js ───────────────────────────────────────────────
const express = require("express");
const multer  = require("multer");
const path    = require("path");

const {
  markAttendance,
  checkOut,
  getAttendance,
  getStats,
  getWeekly,
  getMonthly,
  
} = require("../controllers/attendanceController");

// ─── import your auth middlewares ─────────────────────────────────────────────
// const { verifyStaffToken } = require("../middlewares/authMiddleware");
// const { verifyAdminToken } = require("../middlewares/authMiddleware");

const router = express.Router();

// ─── Multer — selfie upload ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, "uploads/staff/"),
  filename:    (_req, file, cb) => {
    const ext    = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// STAFF-FACING routes (require staff JWT)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/attendance/mark-attendance
router.post(
  "/mark-attendance",
  // verifyStaffToken,
  upload.single("photo"),
  markAttendance
);

// POST /api/attendance/check-out
router.post(
  "/check-out",
  // verifyStaffToken,
  checkOut
);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN routes (require admin JWT)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/attendance?date=2025-04-11&department=KITCHEN&status=Late&search=ravi&page=1&limit=10
router.get(
  "/",
  // verifyAdminToken,
  getAttendance
);

// GET /api/admin/attendance/stats?date=2025-04-11
router.get(
  "/stats",
  // verifyAdminToken,
  getStats
);

// GET /api/admin/attendance/weekly
router.get(
  "/weekly",
  // verifyAdminToken,
  getWeekly
);

// GET /api/admin/attendance/monthly
router.get(
  "/monthly",
  // verifyAdminToken,
  getMonthly
);



module.exports = router;

// ─────────────────────────────────────────────────────────────────────────────
// app.js mein register karo:
//
//   const attendanceRoutes = require("./routes/attendanceRoutes");
//
//   // staff routes
//   app.use("/api/attendance", attendanceRoutes);
//
//   // admin routes
//   app.use("/api/admin/attendance", attendanceRoutes);
// ─────────────────────────────────────────────────────────────────────────────