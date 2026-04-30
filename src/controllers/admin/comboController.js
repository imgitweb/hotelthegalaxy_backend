const Combo = require("../../models/dining/combomodel");
const User = require("../../models/User"); // 🔥 NEW: Imported for WhatsApp users
const MenuItem = require("../../models/dining/menuItemmodel"); // 🔥 NEW: Imported for item names
const uploadToCloudinary = require("../../utils/cloudUpload");
const { sendWhatsAppMessage } = require("../../utils/whatsaap/sendTemplate");

// ==========================================
// 🔥 BACKGROUND JOB FOR COMBO BROADCAST
// ==========================================
const sendComboToAllUsers = async (combo) => {
  try {
    const users = await User.find({ phone: { $exists: true, $ne: null, $ne: "" } });

    if (!users || users.length === 0) {
      console.log("⚠️ No users found to send Combo WhatsApp broadcast.");
      return;
    }

    console.log(`🚀 Starting Combo WhatsApp broadcast for ${users.length} users...`);

    const comboName = combo.name; // {{1}}
    const comboPrice = combo.price; // {{3}}

    // 🛠️ Fetching item names for {{4}} (What's inside)
    let itemNames = [];
    if (combo.items && combo.items.length > 0) {
      const itemsData = await MenuItem.find({ _id: { $in: combo.items } }).select("name");
      itemNames = itemsData.map(item => item.name);
    }

    let itemsIncluded = "Chef's special delicious items"; 
    if (itemNames.length > 0) {
      itemsIncluded = itemNames.join(", ");
      if (itemsIncluded.length > 250) {
        itemsIncluded = itemsIncluded.substring(0, 247) + "..."; // Character limit safeguard
      }
    }

    // 🛠️ Taking the FIRST image from the combo images array for WhatsApp Header
    let headerImageUrl = combo.images && combo.images.length > 0 ? combo.images[0].url : null;

    // Force Cloudinary URL to be .jpg to prevent WhatsApp "UNKNOWN" error
    if (headerImageUrl) {
      const lastSlashIndex = headerImageUrl.lastIndexOf('/');
      const lastDotIndex = headerImageUrl.lastIndexOf('.');

      if (lastDotIndex > lastSlashIndex) {
        headerImageUrl = headerImageUrl.substring(0, lastDotIndex) + ".jpg";
      } else {
        headerImageUrl += ".jpg";
      }
    }

    // Broadcast Loop
    for (const user of users) {
      try {
        const userName = user.fullName || user.name || "Foodie"; // {{2}}

        const parameters = [
          comboName,      // {{1}}
          userName,       // {{2}}
          `${comboPrice}`,// {{3}}
          itemsIncluded   // {{4}}
        ];

        await sendWhatsAppMessage({
          to: user.phone, 
          type: "template",
          templateName: "new_combo_alert", // Dhyan dein: Meta Manager me yahi exact naam hona chahiye
          parameters: parameters,
          headerImageUrl: headerImageUrl 
        });

      } catch (err) {
        console.error(`❌ Failed for number ${user.phone}:`, err.message);
      }
    }

    console.log("🎉 Combo WhatsApp broadcast completed successfully!");

  } catch (error) {
    console.error("❌ Fatal Error in sendComboToAllUsers background job:", error);
  }
};


// ==========================================
// 🍔 COMBO CONTROLLER
// ==========================================
const createCombo = async (req, res) => {
  try {
    let { name, price, items, description } = req.body;

    if (!name || !price) {
      return res.status(400).json({
        success: false,
        message: "Name and price required",
      });
    }

    if (!items) {
      return res.status(400).json({
        success: false,
        message: "Items required",
      });
    }

    if (typeof items === "string") {
      items = JSON.parse(items);
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items required",
      });
    }

    let imageUrls = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await uploadToCloudinary(file.buffer, "combo_items");

        imageUrls.push({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    }

    const combo = await Combo.create({
      name,
      price: Number(price),
      description,
      items,
      images: imageUrls,
    });

    // 🔥 Trigger WhatsApp Broadcast Background Job
    // Broadcast tabhi chalega agar kam se kam 1 image upload hui ho (header parameter ke liye mandatory hai)
    if (imageUrls.length > 0) {
      sendComboToAllUsers(combo);
    }

    res.status(201).json({
      success: true,
      message: "Combo created successfully",
      data: combo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



const getCombos = async (req, res) => {
  try {
    const { includeDeleted } = req.query;

    const filter = includeDeleted === "true" ? {} : { isDeleted: false };

    const combos = await Combo.find(filter)
      .populate("items.item")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: combos,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateCombo = async (req, res) => {
  try {
    let { name, price, items, description } = req.body;

    const combo = await Combo.findById(req.params.id);

    if (!combo) {
      return res.status(404).json({
        success: false,
        message: "Combo not found",
      });
    }

    if (typeof items === "string") {
      items = JSON.parse(items);
    }

    let imageUrls = combo.images || [];

    if (req.files && req.files.length > 0) {
      imageUrls = [];

      for (const file of req.files) {
        const result = await uploadToCloudinary(file.buffer, "combo_items");

        imageUrls.push({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    }

    combo.name = name || combo.name;
    combo.price = price ? Number(price) : combo.price;
    combo.description = description || combo.description;
    combo.items = items || combo.items;
    combo.images = imageUrls;

    await combo.save();

    res.json({
      success: true,
      message: "Combo updated successfully",
      data: combo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const deleteCombo = async (req, res) => {
  try {
    const combo = await Combo.findById(req.params.id);

    if (!combo || combo.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Combo not found",
      });
    }

    combo.isDeleted = true;
    combo.isActive = false;
    combo.deletedAt = new Date();

    await combo.save();

    res.json({
      success: true,
      message: "Combo soft deleted",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const toggleComboStatus = async (req, res) => {
  try {
    console.log("...............", req.params.id)
    const { isActive } = req.body;

    const combo = await Combo.findOne({
      _id: req.params.id,
      isDeleted: false,
    });

    if (!combo) {
      return res.status(404).json({
        success: false,
        message: "Combo not found",
      });
    }

    combo.isActive = isActive;

    await combo.save();

    res.json({
      success: true,
      message: "Status updated",
      data: combo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const restoreCombo = async (req, res) => {
  try {
    const combo = await Combo.findById(req.params.id);

    if (!combo || !combo.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Combo not found or not deleted",
      });
    }

    combo.isDeleted = false;
    combo.deletedAt = null;
    combo.isActive = true;

    await combo.save();

    res.json({
      success: true,
      message: "Combo restored successfully",
      data: combo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createCombo,
  getCombos,
  updateCombo,
  deleteCombo,
  toggleComboStatus,
  restoreCombo,

};
