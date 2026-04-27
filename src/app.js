const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const httpLogger = require("./middleware/loggerMiddleware");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const fileRoutes = require("./routes/fileRoutes");
const publicMenuRoutes = require("./routes/public/menu.routes");
const diningCategory = require("./routes/admin/diningCategoryRoutes");
const subCategoryRoutes = require("./routes/admin/subcategory");
const menuRoutes = require("./routes/admin/menuRoutes");
const rosterRoutes = require("./routes/admin/rosterRoutes");
const ordersRoutes = require("./routes/orders/ordersRoutes");
const categoryRoutes = require("./routes/public/categories.routes");
const addressRoutes = require("./routes/addressRoutes");
const newsletterRoutes = require("./routes/newsletterRoutes");
const offerRoutes = require("./routes/offerRoutes");
const combsRoutes = require("./routes/admin/comboRoutes");
const adminOrderRoutes = require("./routes/admin/adminOrderRoutes");
const enquiryRoutes = require("./routes/enquiryRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const combsRoute = require("./routes/public/combo.routes");
const paymentRoutes = require("./routes/paymentRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");
const chatRoutes = require("./routes/chatRoutes");
const settingRoutes = require("./routes/settingRoutes");
const offerRoutepublic = require("./routes/public/offers.routes");
const dashboardRoutes = require("./routes/admin/dashboardRoutes");
const riderRoutes = require("./routes/admin/rider.routes");
const riderAuthRoutes = require("./routes/riderRoutes");
const staffRoutes = require("./routes/admin/staffRoutes");
const roomRoutes = require("./routes/roomRoutes");
const staffAttendance = require("./routes/staffAuthRoutes")
const adminSettingRoutes = require("./routes/adminSettingRoutes")
const attendanceRoutes = require("./routes/attendanceRoutes");
const deliverySettingRoutes = require("./routes/admin/deliverySettingRoutes")
const checkItemAvailability = require("./routes/roster.routes.js")
const departmentRoutes = require("./routes/admin/departmentRoutes.js")


const couponRoutes = require("./routes/couponRoutes.js");
const path = require("path");
const router = require("express").Router();
const app = express();
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:5173",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  process.env.CLIENT_URL,
  "https://uat.hotelthegalaxy.in",
  "https://www.uat.hotelthegalaxy.in",
  "https://admin.hotelthegalaxy.in",
  "https://www.admin.hotelthegalaxy.in",
  "http://192.168.0.126:3000",
  "https://point-spread-souls-norm.trycloudflare.com",
].filter(Boolean);
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'] 
};

app.use(cors(corsOptions));




app.post(
  "/api/v1/payment/webhook",
  express.raw({ type: "application/json" }),
  require("./controllers/paymentController").handleWebhook
);  

app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(compression());
app.use("/api/chat", chatRoutes);
app.use(httpLogger);
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "/public/uploads"))
);
console.log(
  "Serving static files from:",
  path.join(__dirname, "..", "/public/uploads")
);

// ========================================================
// 6. ROUTES
// ========================================================
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/auth/rider", riderAuthRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/files", fileRoutes);
app.use("/api/v1/menu", publicMenuRoutes);
app.use("/api/v1/admin/dining", diningCategory);
app.use("/api/v1/admin/dining", subCategoryRoutes);
app.use("/api/v1/admin/dining", menuRoutes);
app.use("/api/v1/admin/roster", rosterRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/orders", ordersRoutes);
app.use("/api/v1/addresses", addressRoutes);
app.use("/api/v1/newsletter", newsletterRoutes);
app.use("/api/v1/admin/dining", combsRoutes);
app.use("/api/v1/admin/dining/offers", offerRoutes);
app.use("/api/v1/admin/dining", adminOrderRoutes);
app.use("/api/v1/enquiries", enquiryRoutes);
app.use("/api/v1/reviews", reviewRoutes);
app.use("/api/v1/dining", combsRoute);
app.use("/api/v1/adminSetting",adminSettingRoutes);
app.use("/api/v1/roster",checkItemAvailability);


app.use("/api/v1/settings", settingRoutes);
app.use("/api/webhook", whatsappRoutes);
// app.use("/api/chat", chatRoutes);

app.use("/api/v1/dining/offers", offerRoutepublic);
app.use("/api/v1/admin/dashboard", dashboardRoutes);
app.use("/api/v1/admin/riders", riderRoutes);
app.use("/api/v1/admin/staff", staffRoutes);
app.use("/api/v1/payment" ,paymentRoutes);
app.use("/api/v1/rooms", roomRoutes);
app.use("/api/v1/staffAttendance",staffAttendance);
app.use("/api/v1/admin/staff", staffRoutes);
app.use("/api/v1/settings", deliverySettingRoutes)
app.use("/api/v1/admin/departments",departmentRoutes),
app.use("/api/v1/admin/coupons", couponRoutes);
app.use("/api/v1/admin/attendance", attendanceRoutes);

app.use(
  "/api/v1/admin/availability",
  require("./routes/admin/availabilityRoutes")
);
app.use("/api/geocode", require("./routes/geocodeRoutes"));

// ========================================================
// 7. ERROR HANDLING
// ========================================================
app.use(notFound);
app.use(errorHandler);
app.use(mongoSanitize());
app.use(xss());
module.exports = app;


