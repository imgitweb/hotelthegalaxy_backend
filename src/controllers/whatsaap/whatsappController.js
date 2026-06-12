const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

const WhatsAppAccount = require("../../models/whatsaap/WhatsAppAccount");
const WhatsAppConversation = require("../../models/whatsaap/WhatsAppConversation");
const WhatsAppMessage = require("../../models/whatsaap/WhatsAppMessage");
const WhatsAppTemplate = require("../../models/whatsaap/WhatsAppTemplate");
const WhatsAppCampaignLog = require("../../models/whatsaap/WhatsAppCampaignLog");
const User = require("../../models/User"); // Tumhara User Model

// .env variables
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WABA_ID = process.env.waba_id;

// ==========================================
// 1. GET CONVERSATIONS (Chat History)
// ==========================================
exports.getConversations = async (req, res) => {
  try {
    const conversations = await WhatsAppConversation.find({ phone_number_id: PHONE_ID })
      .sort({ last_message_time: -1 });
    
    res.status(200).json({ success: true, conversations });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

// ==========================================
// 2. GET MESSAGES (Single Chat Thread)
// ==========================================
exports.getMessages = async (req, res) => {
  try {
    const { convId } = req.params;
    const messages = await WhatsAppMessage.find({ conversation_id: convId })
      .sort({ createdAt: 1 });
    
    res.status(200).json({ success: true, messages });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

// ==========================================
// 3. SEND SINGLE MESSAGE
// ==========================================
exports.sendMessage = async (req, res) => {
  try {
    const { customer_phone, text, conversationId } = req.body;

    const metaRes = await axios.post(
      `https://graph.facebook.com/v23.0/${PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: customer_phone,
        type: "text",
        text: { body: text }
      },
      { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } }
    );

    // ✅ Safely extract message_id
    const wamid = metaRes.data?.messages?.[0]?.id;

    const newMessage = await WhatsAppMessage.create({
      message_id: wamid, // 👈 Saved correctly here
      conversation_id: conversationId,
      sender_id: PHONE_ID,
      receiver_id: customer_phone,
      text: text,
      is_from_me: true,
      message_type: "text", // Explicitly define type
      status: "sent"        // 👈 Status added for webhook tracking
    });

    await WhatsAppConversation.findByIdAndUpdate(conversationId, { 
      last_message: text, 
      last_message_time: new Date() 
    });

    res.status(200).json({ success: true, message: newMessage });
  } catch (error) {
    console.error("WA Send Error:", error.response?.data || error);
    res.status(500).json({ error: "Failed to send WA message" });
  }
};

// ==========================================
// 4. GET TEMPLATES
// ==========================================
exports.getTemplates = async (req, res) => {
  try {
    const templates = await WhatsAppTemplate.find({ phone_number_id: PHONE_ID })
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, templates });
  } catch (error) {
    console.error("Error fetching templates:", error);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
};

// ==========================================
// 5. SYNC TEMPLATES FROM META
// ==========================================
exports.syncTemplates = async (req, res) => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v23.0/${WABA_ID}/message_templates`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );

    const metaTemplates = response.data.data;
    if (!metaTemplates || metaTemplates.length === 0) {
      return res.status(200).json({ success: true, message: "No templates on Meta.", templates: [] });
    }

    const bulkOps = metaTemplates.map(tpl => ({
      updateOne: {
        filter: { waba_id: WABA_ID, name: tpl.name, language: tpl.language },
        update: {
          $set: {
            phone_number_id: PHONE_ID, 
            meta_template_id: tpl.id,
            category: tpl.category, 
            components: tpl.components, 
            status: tpl.status
          }
        },
        upsert: true
      }
    }));

    if (bulkOps.length > 0) await WhatsAppTemplate.bulkWrite(bulkOps);

    const updatedTemplates = await WhatsAppTemplate.find({ phone_number_id: PHONE_ID }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, message: "Synced successfully.", templates: updatedTemplates });
  } catch (error) {
    console.error("Meta Sync Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to sync templates." });
  }
};

// ==========================================
// 6. SEND BULK TEMPLATE MESSAGES (With Deep Tracking)
// ==========================================
exports.sendBulkTemplate = async (req, res) => {
  try {
    const { templateName, language, recipients, headerImageUrl } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: "Recipients array is mandatory." });
    }

    const template = await WhatsAppTemplate.findOne({ phone_number_id: PHONE_ID, name: templateName });
    if (!template) return res.status(404).json({ error: "Template not found." });

    // Step 1: Deduplication & Formatting (Ensure all start with 91)
    const uniqueRecipientsMap = new Map();

    recipients.forEach(rec => {
      if (!rec.phone) return;
      let cleanedPhone = String(rec.phone).replace(/[^0-9]/g, '');
      
      if (cleanedPhone.length === 10) {
        cleanedPhone = '91' + cleanedPhone;
      }

      if (cleanedPhone.length >= 10) {
        if (!uniqueRecipientsMap.has(cleanedPhone)) {
          uniqueRecipientsMap.set(cleanedPhone, { ...rec, phone: cleanedPhone });
        }
      }
    });

    const uniqueRecipients = Array.from(uniqueRecipientsMap.values());
    const uniquePhonesList = uniqueRecipients.map(r => r.phone);

    // Step 2: Auto-Add New Users from Excel/Manual to the User DB
    try {
      const existingUsers = await User.find({ phone: { $in: uniquePhonesList } }).select("phone");
      const existingPhoneSet = new Set(existingUsers.map(u => u.phone));
      
      const newUsersToCreate = [];
      uniqueRecipients.forEach(rec => {
        if (!existingPhoneSet.has(rec.phone)) {
          newUsersToCreate.push({
            fullName: rec.name || "Customer",
            phone: rec.phone,
            authProvider: "whatsapp",
            isActive: true,
            isVerified: false
          });
        }
      });

      if (newUsersToCreate.length > 0) {
        await User.insertMany(newUsersToCreate, { ordered: false });
      }
    } catch (dbSyncError) {
      console.error("Error auto-adding users to database:", dbSyncError);
    }

    // Step 3: Preparation for Loop
    const results = { total: uniqueRecipients.length, success: 0, failed: 0, errors: [] };
    const deliveryDetails = [];

    const resolveTemplateText = (tpl, vars = []) => {
      let text = tpl?.components?.find(c => c.type?.toLowerCase() === "body")?.text || "Template Message";
      vars.forEach((val, i) => {
        text = text.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), val || "");
      });
      return text;
    };

    // Step 4: Send Messages and create Tracking Data
    for (const rec of uniqueRecipients) {
      try {
        let components = [];

        if (headerImageUrl) {
          components.push({
            type: "header",
            parameters: [{ type: "image", image: { link: headerImageUrl } }]
          });
        }

        if (rec.variables && rec.variables.length > 0) {
          components.push({
            type: "body",
            parameters: rec.variables.map(val => ({ type: "text", text: String(val || " ") }))
          });
        }

        const metaResponse = await axios.post(
          `https://graph.facebook.com/v23.0/${PHONE_ID}/messages`,
          {
            messaging_product: "whatsapp",
            to: rec.phone,
            type: "template",
            template: { 
              name: templateName, 
              language: { code: language || "en_US" }, 
              components: components.length > 0 ? components : undefined 
            }
          },
          { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } }
        );

        // ✅ FIX APPLIED HERE: Safely extract ID using optional chaining (?.)
        const messageId = metaResponse.data?.messages?.[0]?.id;
        const resolvedText = resolveTemplateText(template, rec.variables || []);

        // Save Conversation for Chat Inbox (Live Chats)
        const conversation = await WhatsAppConversation.findOneAndUpdate(
          { phone_number_id: PHONE_ID, customer_phone: rec.phone },
          {
            $set: { last_message: resolvedText, last_message_time: new Date() },
            $setOnInsert: { customer_name: rec.name || "Customer", ai_enabled: true }
          },
          { upsert: true, returnDocument: 'after' } // Deprecation Warning Fixed
        );

        // INDIVIDUAL TRACKING: Ye record batayega ki kis user (rec.phone) ko kon sa template (templateName) gaya hai.
        await WhatsAppMessage.create({
          message_id: messageId, // ✅ Saved correctly here
          status: "sent",        // ✅ Starting status added for webhook syncing
          conversation_id: conversation._id,
          sender_id: PHONE_ID,
          receiver_id: rec.phone,  // User ka phone number
          text: resolvedText,
          is_from_me: true,
          is_read: true,
          message_type: "template",
          template_name: templateName, // Track specific template
          template_id: template._id,
          meta_template_id: template.meta_template_id,
          media_url: headerImageUrl || null
        });

        results.success++;
        deliveryDetails.push({ phone: rec.phone, status: "success", message_id: messageId });
      } catch (err) {
        results.failed++;
        const errMsg = err.response?.data?.error?.message || err.message;
        deliveryDetails.push({ phone: rec.phone, status: "failed", error_message: errMsg });
      }
    }

    // Step 5: BATCH TRACKING: Ye batayega ki iss template ki total kitni history (reach) hai.
    await WhatsAppCampaignLog.create({
      phone_number_id: PHONE_ID, 
      template_name: templateName,
      template_id: template._id, // Add template_id to logs for easy querying later
      total_recipients: results.total, 
      successful_sends: results.success,
      failed_sends: results.failed, 
      delivery_details: deliveryDetails
    });

    res.status(200).json({ success: true, message: `Campaign Complete! Delivered: ${results.success}, Failed: ${results.failed}`, results });
  } catch (error) {
    console.error("Bulk Send Error:", error);
    res.status(500).json({ error: "Failed to process campaign." });
  }
};

// ==========================================
// 7. FETCH WHATSAPP PROFILE DETAILS
// ==========================================
exports.getProfileDetails = async (req, res) => {
  try {
    let account = await WhatsAppAccount.findOne({ phone_number_id: PHONE_ID });
    
    if (!account) {
      account = new WhatsAppAccount({
        phone_number_id: PHONE_ID,
        waba_id: process.env.waba_id,
        display_phone_number: PHONE_ID,
        access_token: TOKEN
      });
      await account.save();
    }

    const [profileRes, phoneRes] = await Promise.all([
      axios.get(
        `https://graph.facebook.com/v23.0/${PHONE_ID}/whatsapp_business_profile`,
        { headers: { Authorization: `Bearer ${TOKEN}` }, params: { fields: "about,address,description,email,profile_picture_url,websites,vertical" } }
      ).catch(() => ({ data: { data: [{}] } })),
      
      axios.get(
        `https://graph.facebook.com/v23.0/${PHONE_ID}`,
        { headers: { Authorization: `Bearer ${TOKEN}` }, params: { fields: "verified_name,name_status" } }
      ).catch(() => ({ data: {} }))
    ]);

    const profileData = profileRes.data.data[0] || {};
    const phoneData = phoneRes.data || {};

    account.about = profileData.about || account.about;
    account.description = profileData.description || account.description;
    account.email = profileData.email || account.email;
    account.address = profileData.address || account.address;
    account.profile_picture_url = profileData.profile_picture_url || account.profile_picture_url;
    account.websites = profileData.websites || account.websites;
    account.verified_name = phoneData.verified_name || account.verified_name;
    account.name_status = phoneData.name_status || account.name_status;
    
    await account.save();

    const safeProfile = account.toObject();
    delete safeProfile.access_token;

    res.status(200).json({ success: true, profile: safeProfile });
  } catch (error) {
    console.error("Fetch Profile Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch WhatsApp profile details." });
  }
};

// ==========================================
// 8. UPDATE WHATSAPP PROFILE DETAILS
// ==========================================
exports.updateProfileDetails = async (req, res) => {
  try {
    const { description, address, email, websites, about, verified_name } = req.body;

    const account = await WhatsAppAccount.findOne({ phone_number_id: PHONE_ID });
    if (!account) return res.status(404).json({ error: "Account not found in database." });

    const payload = { messaging_product: "whatsapp" };
    let shouldUpdateProfile = false;
    
    if (description !== undefined) { payload.description = description; shouldUpdateProfile = true; }
    if (address !== undefined) { payload.address = address; shouldUpdateProfile = true; }
    if (email !== undefined) { payload.email = email; shouldUpdateProfile = true; }
    if (websites !== undefined) { payload.websites = websites; shouldUpdateProfile = true; }

    if (shouldUpdateProfile) {
      await axios.post(
        `https://graph.facebook.com/v23.0/${PHONE_ID}/whatsapp_business_profile`,
        payload,
        { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } }
      );
    }

    if (about !== undefined && about !== account.about) {
      await axios.post(
        `https://graph.facebook.com/v23.0/${PHONE_ID}/settings`,
        { messaging_product: "whatsapp", about: about },
        { headers: { Authorization: `Bearer ${TOKEN}` } }
      );
    }

    if (verified_name && verified_name !== account.verified_name) {
      await axios.post(
        `https://graph.facebook.com/v23.0/${PHONE_ID}`,
        { messaging_product: "whatsapp", verified_name: verified_name },
        { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } }
      );
      account.name_status = "PENDING_REVIEW"; 
    }

    if (description !== undefined) account.description = description;
    if (address !== undefined) account.address = address;
    if (email !== undefined) account.email = email;
    if (websites !== undefined) account.websites = websites;
    if (about !== undefined) account.about = about;
    if (verified_name !== undefined) account.verified_name = verified_name;
    
    await account.save();

    res.status(200).json({ success: true, message: "Profile updated successfully!", profile: account });
  } catch (error) {
    console.error("Update Profile Error:", error.response?.data || error.message);
    const metaError = error.response?.data?.error?.message || "Failed to update profile details.";
    res.status(400).json({ error: metaError });
  }
};

// ==========================================
// 9. GET ALL USERS FOR BULK MESSAGING (CRM)
// ==========================================
exports.getAllUsersForCRM = async (req, res) => {
  try {
    const users = await User.find({ deletedAt: null })
      .select("fullName phone email isActive isVerified")
      .sort({ createdAt: -1 })
      .lean();

    const contacts = users.map(user => ({
      _id: user._id,
      name: user.fullName || "User", 
      phone: user.phone,
      email: user.email || "",
      status: user.isActive ? "Active" : "Inactive", 
      isVerified: user.isVerified
    }));

    res.status(200).json({
      success: true,
      data: {
        contacts: contacts
      }
    });
  } catch (error) {
    console.error("Error fetching CRM users:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch users for campaign." 
    });
  }
};



// ==========================================
// 10. GET WHATSAPP INSIGHTS (Analytics)
// ==========================================
exports.getInsights = async (req, res) => {
  try {
    const { category } = req.query;

    // Step 1: Filter Templates by Category
    const templateQuery = { phone_number_id: PHONE_ID };
    if (category && category !== "ALL") {
      templateQuery.category = category;
    }
    const templates = await WhatsAppTemplate.find(templateQuery).lean();
    const templateNames = templates.map(t => t.name);

    // Agar category filter lagaya aur koi template nahi mila toh empty return karo
    if (templateNames.length === 0) {
      return res.status(200).json({
        success: true,
        metrics: { delivered: 0, read: 0, readRate: 0, clicked: 0, clickRate: 0 },
        templateBreakdown: [],
        recentHistory: []
      });
    }

    // Step 2: Fetch Base Messages for Metrics
    const matchQuery = {
      sender_id: PHONE_ID,
      message_type: "template",
      template_name: { $in: templateNames }
    };

    // Calculate Overall Metrics using Aggregation
    const metricsAgg = await WhatsAppMessage.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          total_sent: { $sum: 1 },
          total_delivered: { 
            $sum: { $cond: [{ $in: ["$status", ["delivered", "read"]] }, 1, 0] } 
          },
          total_read: { 
            $sum: { $cond: [{ $eq: ["$status", "read"] }, 1, 0] } 
          }
        }
      }
    ]);

    const stats = metricsAgg[0] || { total_sent: 0, total_delivered: 0, total_read: 0 };
    
    // Calculate Rates
    const readRate = stats.total_delivered > 0 
      ? Math.round((stats.total_read / stats.total_delivered) * 100) 
      : 0;
      
    // Note: Meta doesn't easily provide link "clicks" out-of-the-box without URL tracking, 
    // keeping it 0 for UI consistency unless you implement a redirect tracker.
    const metrics = {
      delivered: stats.total_delivered,
      read: stats.total_read,
      readRate: readRate,
      clicked: 0, 
      clickRate: 0
    };

    // Step 3: Template Breakdown
    const breakdownAgg = await WhatsAppMessage.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$template_name",
          sent: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $in: ["$status", ["delivered", "read"]] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ["$status", "read"] }, 1, 0] } }
        }
      },
      { $sort: { sent: -1 } }
    ]);

    // Map categories back to breakdown
    const templateBreakdown = breakdownAgg.map(item => {
      const tpl = templates.find(t => t.name === item._id);
      return {
        id: item._id, // Using name as ID for unique key
        name: item._id,
        category: tpl ? tpl.category : "UNKNOWN",
        sent: item.sent,
        delivered: item.delivered,
        read: item.read
      };
    });

    // Step 4: Recent History (Last 50 messages)
    const recentMessages = await WhatsAppMessage.find(matchQuery)
      .sort({ createdAt: -1 })
      .limit(50)
      .select("receiver_id template_name status createdAt")
      .lean();

    const recentHistory = recentMessages.map(msg => ({
      id: msg._id,
      phone: msg.receiver_id,
      template_name: msg.template_name,
      status: msg.status, // e.g. "sent", "delivered", "read", "failed"
      date: msg.createdAt
    }));

    res.status(200).json({
      success: true,
      metrics,
      templateBreakdown,
      recentHistory
    });

  } catch (error) {
    console.error("Insights Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch analytics and insights." });
  }
};




exports.toggleAIStatus = async (req, res) => {
  try {
    const { customer_phone, ai_enabled } = req.body;

    // Validation: Check if required fields are provided
    if (!customer_phone || typeof ai_enabled !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide a valid 'customer_phone' and a boolean 'ai_enabled' (true/false)." 
      });
    }

    // Find and update the conversation
    const updatedConversation = await WhatsAppConversation.findOneAndUpdate(
      { 
        phone_number_id: PHONE_ID, // Ensure we update for the correct WA Bot number
        customer_phone: customer_phone 
      },
      { 
        $set: { ai_enabled: ai_enabled } 
      },
      { 
        new: true // Return the updated document instead of the old one
      }
    );

    // Agar user ka record database mein nahi mila
    if (!updatedConversation) {
      return res.status(404).json({ 
        success: false, 
        message: `No conversation found for customer: ${customer_phone}` 
      });
    }

    // Success response
    return res.status(200).json({
      success: true,
      message: `AI enabled status is now set to ${ai_enabled} for ${customer_phone}`,
      data: updatedConversation
    });

  } catch (error) {
    console.error("❌ Error in toggleAIStatus:", error.message);
    return res.status(500).json({ 
      success: false, 
      message: "Internal Server Error" 
    });
  }
};