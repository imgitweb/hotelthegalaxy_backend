const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.json({ message: "File routes working" });
});

module.exports = router;
