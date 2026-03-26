const express = require("express");
const router = express.Router();

const { verifyWebhook, receiveMessage } = require("../controllers/whatsappController");

router.get("/", verifyWebhook);
router.post("/", receiveMessage);

module.exports = router;
