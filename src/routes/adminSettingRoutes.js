const router = require("express").Router();
const upload = require("../middleware/upload");
const {
  getSettings,
  updateSettings,
} = require("../controllers/adminSettingController");
router.put("/", upload.single("avatar"), updateSettings);
router.get("/", getSettings);


module.exports = router;