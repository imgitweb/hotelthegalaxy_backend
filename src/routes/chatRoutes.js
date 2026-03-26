const express = require("express");
const router = express.Router();
const { chatMessage } = require("../controllers/chatController");

router.post("/chat", chatMessage);

module.exports = router;