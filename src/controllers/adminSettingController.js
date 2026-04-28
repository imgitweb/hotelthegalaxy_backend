const fs = require("fs");
const path = require("path");
const Settings = require("../models/adminSetting");


exports.getSettings = async (req, res) => {
  const settings = await Settings.findOne();
  res.json({ success: true, data: settings });
};

exports.updateSettings = async (req, res) => {
  let settings = await Settings.findOne();

  let avatarPath = settings?.avatar || "";

  if (req.file) {
    const uploadDir = path.join(__dirname, "../../public/uploads/settings");

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // 🧠 extension auto detect
    const ext = req.file.mimetype.split("/")[1];
    const fileName = `settings-${Date.now()}.${ext}`;
    const filePath = path.join(uploadDir, fileName);

    // 💾 save buffer to disk
    fs.writeFileSync(filePath, req.file.buffer);

    // 🧹 delete old image
    if (settings?.avatar) {
 const oldPath = path.join(
  __dirname,
  "../../public",
  settings.avatar.replace("/uploads", "uploads")
);

      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    avatarPath = `/uploads/settings/${fileName}`;
  }

  const data = {
    ...req.body,
    avatar: avatarPath,
  };

  if (!settings) {
    settings = await Settings.create(data);
  } else {
    settings = await Settings.findByIdAndUpdate(
      settings._id,
      data,
      { new: true }
    );
  }

  res.json({ success: true, data: settings });
};