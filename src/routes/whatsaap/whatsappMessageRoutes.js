const express = require("express");
const { 
  getConversations, 
  getMessages, 
  sendMessage, 
  getTemplates, 
  syncTemplates, 
  sendBulkTemplate,
  getProfileDetails,
  updateProfileDetails,
  getAllUsersForCRM,
  getInsights,
  toggleAIStatus
} = require("../../controllers/whatsaap/whatsappController");

// Agar aapke paas auth middleware hai, toh usko yahan require karein. 
// Path apne project structure ke hisaab se adjust kar lena.
const { adminAuth, authorizeRoles } = require("../../middleware/adminAuth");

const router = express.Router();

router.get("/profile",  getProfileDetails);
router.post("/profile/update",  updateProfileDetails);


// Chat APIs
router.get("/conversations",  getConversations);
router.get("/conversations/:convId/messages",  getMessages);
router.post("/send-message",  sendMessage);

// Template APIs
router.get("/templates", getTemplates);
router.post("/templates/sync", syncTemplates);

// Bulk Send API
router.post("/bulk-send", sendBulkTemplate);

router.get("/user", getAllUsersForCRM);

router.get("/insights", getInsights);

router.patch("/toggle-ai", toggleAIStatus);

module.exports = router;