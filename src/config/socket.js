const { Server } = require("socket.io");
const Order = require("../models/User/ordersModel");
// ✅ Fix - named export hai toh destructure karo
const { calculateETA } = require("../utils/calculateETA");

let io;

const lastUpdateMap = new Map();

// 🔥 Reduce throttle for realtime tracking
const LOCATION_UPDATE_INTERVAL = 1000;

const initSocket = (server) => {

  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:3000",
        "http://localhost:3002",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "https://uat.hotelthegalaxy.in",
        "https://admin.hotelthegalaxy.in",
        ...(process.env.CLIENT_URL
          ? process.env.CLIENT_URL.split(",")
          : []),
      ].filter(Boolean),

      methods: ["GET", "POST"],
      credentials: true,
    },

    transports: ["polling", "websocket"],
  });

  // =========================================================
  // 🔌 SOCKET CONNECTION
  // =========================================================
  io.on("connection", (socket) => {

    console.log("\n═══════════════════════════════");
    console.log("⚡ SOCKET CONNECTED");
    console.log("🆔 Socket ID:", socket.id);
    console.log("🌍 Origin:", socket.handshake.headers.origin);
    console.log("🚀 Transport:", socket.conn.transport.name);
    console.log("═══════════════════════════════\n");

    // =========================================================
    // 🧑‍💻 ADMIN JOIN
    // =========================================================
    socket.on("join_admin", () => {

      console.log("\n🧑‍💻 join_admin EVENT");

      socket.join("admin_room");

      console.log("✅ Admin joined admin_room");
      console.log("📋 Rooms:", [...socket.rooms]);

    });

    // =========================================================
    // 🚴 RIDER JOIN
    // =========================================================
    socket.on("join_rider", (riderId) => {

      console.log("\n🚴 join_rider EVENT HIT");
      console.log("📦 riderId received:", riderId);

      if (!riderId) {

        console.log("❌ riderId missing");

        return;
      }

      socket.join(`rider_${riderId}`);

      console.log(`✅ Rider joined room: rider_${riderId}`);
      console.log("📋 Current Rooms:", [...socket.rooms]);

    });

    // =========================================================
    // 👤 USER JOIN ORDER ROOM
    // =========================================================
    socket.on("join_order_room", (orderId) => {

      console.log("\n👤 join_order_room EVENT");
      console.log("📦 Order ID:", orderId);

      if (!orderId) {

        console.log("❌ orderId missing");

        return;
      }

      socket.join(orderId);

      console.log(`✅ User joined room: ${orderId}`);
      console.log("📋 Current Rooms:", [...socket.rooms]);

    });

    // =========================================================
    // 📍 RIDER LOCATION UPDATE
    // =========================================================
    socket.on("rider_location_update", async (data) => {

      console.log("\n════════ LOCATION EVENT ════════");

      try {

        console.log("📍 RAW DATA:", data);

        const { orderId, lat, lng } = data;

        console.log("📦 orderId:", orderId);
        console.log("🌍 lat:", lat);
        console.log("🌍 lng:", lng);

        const parsedLat = Number(lat);
        const parsedLng = Number(lng);

        console.log("🔢 parsedLat:", parsedLat);
        console.log("🔢 parsedLng:", parsedLng);

        // =========================================================
        // ❌ VALIDATION
        // =========================================================
        if (!orderId || isNaN(parsedLat) || isNaN(parsedLng)) {

          console.log("❌ INVALID LOCATION DATA");

          return;
        }

        // =========================================================
        // ⏱️ THROTTLE CHECK
        // =========================================================
        const now = Date.now();

        const lastUpdate =
          lastUpdateMap.get(orderId) || 0;

        console.log("⏱️ Time Difference:", now - lastUpdate);

        if (now - lastUpdate < LOCATION_UPDATE_INTERVAL) {

          console.log("⏳ LOCATION THROTTLED");

          return;
        }

        lastUpdateMap.set(orderId, now);

        // =========================================================
        // 🔍 FIND ORDER
        // =========================================================
        console.log("🔍 Finding Order...");

        const order = await Order.findById(orderId);

        if (!order) {

          console.log("❌ ORDER NOT FOUND");

          return;
        }

        console.log("✅ ORDER FOUND");

        // =========================================================
        // 📍 UPDATE LOCATION
        // =========================================================
        order.deliveryPartnerLocation = {
          lat: parsedLat,
          lng: parsedLng,
          updatedAt: new Date(),
        };

        console.log("📍 Updated deliveryPartnerLocation");

        // =========================================================
        // 🕐 ETA CALCULATION
        // =========================================================
       

        try {

          console.log("🕐 Calculating ETA...");

const etaResult = await calculateETA(order);
eta = etaResult.eta;
order.eta = eta;

          console.log("✅ ETA:", eta);

        } catch (err) {

          console.log("❌ ETA ERROR:", err.message);

        }

        // =========================================================
        // 💾 SAVE ORDER
        // =========================================================
        console.log("💾 Saving order...");

        await order.save();

        console.log("✅ ORDER SAVED");

        // =========================================================
        // 👤 USER UPDATE
        // =========================================================
        console.log("📡 Emitting order_update");

        io.to(orderId).emit("order_update", {
          partnerLocation: {
            lat: parsedLat,
            lng: parsedLng,
          },
          eta,
        });

        console.log("✅ order_update emitted");

        // =========================================================
        // 🧑‍💻 ADMIN UPDATE
        // =========================================================
        console.log("📡 Emitting admin_rider_location");

        io.to("admin_room").emit(
          "admin_rider_location",
          {
            orderId,
            lat: parsedLat,
            lng: parsedLng,
            eta,
          }
        );

        console.log("✅ admin_rider_location emitted");

      } catch (err) {

        console.log("💥 SOCKET ERROR");
        console.error(err);

      }

      console.log("═══════════════════════════════\n");

    });

    // =========================================================
    // ❌ DISCONNECT
    // =========================================================
    socket.on("disconnect", (reason) => {

      console.log("\n═══════════════════════════════");
      console.log("❌ SOCKET DISCONNECTED");
      console.log("🆔 Socket:", socket.id);
      console.log("📋 Rooms:", [...socket.rooms]);
      console.log("📴 Reason:", reason);
      console.log("═══════════════════════════════\n");

    });

  });
};

// =========================================================
// 🔥 GET IO INSTANCE
// =========================================================
const getIO = () => {

  if (!io) {

    throw new Error("Socket not initialized");

  }

  return io;
};

module.exports = {
  initSocket,
  getIO,
};