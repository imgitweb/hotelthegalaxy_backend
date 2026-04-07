const express = require("express");
const router = express.Router();
const { chatMessage,testWhatsAppTrigger } = require("../controllers/chatController");

router.post("/", chatMessage);

router.post('/test-whatsapp', testWhatsAppTrigger)



module.exports = router;