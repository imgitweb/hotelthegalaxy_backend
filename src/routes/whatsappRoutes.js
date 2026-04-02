const express = require("express");
const router = express.Router();

const { verifyWebhook, receiveMessage } = require("../controllers/whatsappController");

router.get("/", verifyWebhook);
router.post("/", (req,res)=>{
    console.log("Request data", req.body)
});

module.exports = router;
