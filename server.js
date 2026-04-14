const dotenv = require("dotenv");
dotenv.config();
const { initSocket } = require("./src/config/socket");
const http = require('http');
const { initWebSocketServer } = require('./websocket');
const app = require("./src/app");
const connectDB = require("./src/config/db");

const PORT = process.env.PORT || 5000;


connectDB();

const server = app.listen(PORT, () => {
  initSocket(server);
  console.log(`🚀 Server running on port ${PORT}`);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION 💥", err);
  server.close(() => process.exit(1));
});