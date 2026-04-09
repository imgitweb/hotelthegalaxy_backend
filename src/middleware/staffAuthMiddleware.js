const jwt = require("jsonwebtoken");
exports.staffAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ No token provided");
      return res.status(401).json({ message: "Unauthorized" });
    }
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET
    );
    req.user = decoded;
    console.log("✅ Auth success:", decoded);
    next();
  } catch (err) {
    console.error("🔥 Auth error:", err.message);
    return res.status(401).json({ message: "Invalid token" });
  }
};