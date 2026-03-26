let redisClient = null;

const connectRedis = async () => {
  if (!process.env.REDIS_URL) {
    console.warn("⚠️ Redis not configured");
    return null;
  }

  const { createClient } = require("redis");

  redisClient = createClient({
    url: process.env.REDIS_URL,
  });

  redisClient.on("error", (err) => console.error("❌ Redis Error:", err));

  await redisClient.connect();
  console.log("✅ Redis connected");

  return redisClient;
};

module.exports = connectRedis;
