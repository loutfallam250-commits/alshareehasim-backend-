const mongoose = require("mongoose");

const subCategorySettingsSchema = new mongoose.Schema({
  category: { type: String, required: true },
  subCategory: { type: String, required: true },
  showInHome: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  image: { type: String, default: "" },
  bannerImage: { type: String, default: "" },
  bannerImages: { type: [String], default: [] },
});

subCategorySettingsSchema.index({ category: 1, subCategory: 1 }, { unique: true });

module.exports = mongoose.model("SubCategorySettings", subCategorySettingsSchema);
