


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

const { adminAuth, authorizeRoles } = require("../middleware/adminAuth")





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

router.use(adminAuth);
router.use(authorizeRoles("admin"));


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
