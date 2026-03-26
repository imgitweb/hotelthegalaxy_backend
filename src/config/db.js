const mongoose = require("mongoose");

const MAX_RETRIES = 5;
let retryCount = 0;

const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI;

  if (!mongoURI) {
    console.error("❌ MONGO_URI is not defined");
    process.exit(1);
  }

  mongoose.set("strictQuery", true);

  try {
    await mongoose
      .connect(mongoURI)
      .then(() => console.log("✅ MongoDB connected"));
  } catch (err) {
    retryCount += 1;
    console.error(`❌ MongoDB connection failed (attempt ${retryCount})`);
    console.error(err.message);

    if (retryCount >= MAX_RETRIES) {
      console.error("💥 Max MongoDB retries reached. Exiting...");
      process.exit(1);
    }

    setTimeout(connectDB, 5000);
  }
};

mongoose.connection.on("connected", () => {
  console.log("🟢 MongoDB connection established");
});

mongoose.connection.on("error", (err) => {
  console.error("🔴 MongoDB runtime error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.warn("🟠 MongoDB disconnected");
});

const shutdownDB = async (signal) => {
  console.log(`⚠️ ${signal} received. Closing MongoDB connection...`);
  await mongoose.connection.close(false);
  console.log("🔌 MongoDB connection closed");
  process.exit(0);
};

process.on("SIGINT", shutdownDB);
process.on("SIGTERM", shutdownDB);

module.exports = connectDB;
