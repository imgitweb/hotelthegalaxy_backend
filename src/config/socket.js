const { Server } = require("socket.io");
const Order = require("../models/User/ordersModel");
const calculateETA = require("../utils/calculateETA"); 

let io;

const lastUpdateMap = new Map(); 

const LOCATION_UPDATE_INTERVAL = 5000; 

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL.split(","),
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("⚡ Connected:", socket.id);

    socket.on("rider_location_update", async (data) => {
      try {
        const { orderId, lat, lng } = data;

        const parsedLat = Number(lat);
        const parsedLng = Number(lng);


        if (!orderId || isNaN(parsedLat) || isNaN(parsedLng)) {
          console.warn("❌ Invalid location data:", data);
          return;
        }

     
        const now = Date.now();
        const lastUpdate = lastUpdateMap.get(orderId) || 0;

        if (now - lastUpdate < LOCATION_UPDATE_INTERVAL) {
          return; 
        }

        lastUpdateMap.set(orderId, now);

        const order = await Order.findById(orderId);
        if (!order) return;

        order.deliveryPartnerLocation = {
          lat: parsedLat,
          lng: parsedLng,
          updatedAt: new Date(),
        };

        let eta = 0;
        try {
          eta = await calculateETA(order);
          order.eta = eta;
        } catch (err) {
          console.warn("ETA error:", err.message);
        }

        await order.save();

        io.to(orderId).emit("order_update", {
          partnerLocation: {
            lat: parsedLat,
            lng: parsedLng,
          },
          eta,
        });

        io.to("admin_room").emit("admin_rider_location", {
          riderId: socket.id,
          lat: parsedLat,
          lng: parsedLng,
          orderId,
          eta,
        });

      } catch (err) {
        console.error("💥 Socket error:", err);
      }
    });

    socket.on("join_order_room", (orderId) => {
      if (!orderId) return;

      socket.join(orderId);
      console.log(`👤 User joined order room: ${orderId}`);
    });

    socket.on("join_admin", () => {
      socket.join("admin_room");
      console.log("🧑‍💻 Admin joined");
    });

    socket.on("disconnect", () => {
      console.log("❌ Disconnected:", socket.id);
    });
  });
};

const getIO = () => io;

module.exports = { initSocket, getIO };