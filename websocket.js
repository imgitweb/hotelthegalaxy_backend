// websocket.js
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

let wss; // Global variable to store the WebSocket Server instance

// 1. WebSocket Server ko Initialize karne ka function
const initWebSocketServer = (server) => {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    // URL se token nikalna (e.g., ws://localhost:5000?token=xyz)
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, "Unauthorized: No token provided");
      return;
    }

    try {
      // Token verify karna
      const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'your-secret-key');

      // Connection ke sath user ki details save kar lena (taki baad mein easily dhoondh sakein)
      ws.userId = decoded.riderId || decoded.adminId || decoded.id || decoded._id; 
      ws.role = decoded.role || "unknown";

      console.log(`🔌 WebSocket Connected: User ${ws.userId} (${ws.role})`);

      // Client se aane wale messages handle karna
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          
          // Frontend se subscribe event aane par role update kar sakte hain
          if (data.type === 'subscribe') {
            ws.role = data.role || ws.role;
          } 
          // Connection zinda rakhne ke liye ping-pong
          else if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch (e) {
          console.error("WS Message Error:", e.message);
        }
      });

      ws.on('close', () => {
        console.log(`❌ WebSocket Disconnected: User ${ws.userId}`);
      });

    } catch (error) {
      console.error("WebSocket Auth Error:", error.message);
      ws.close(4002, "Unauthorized: Invalid token");
    }
  });

  console.log("🚀 WebSocket Server Initialized!");
  return wss;
};

// 2. Kisi bhi controller se WebSocket Server ko access karne ka function
const getWebSocketServer = () => {
  if (!wss) {
    console.warn("WebSocket server is not initialized yet!");
  }
  return wss;
};

module.exports = { initWebSocketServer, getWebSocketServer };