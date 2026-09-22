const mongoose = require("mongoose");

const cardFieldSettingsSchema = new mongoose.Schema({
  showExpiryDate: { type: Boolean, default: true },
  showCvv: { type: Boolean, default: true },
});

module.exports = mongoose.model("CardFieldSettings", cardFieldSettingsSchema);
