const mongoose = require("mongoose");

const subCategorySchema = new mongoose.Schema(
  { name: { type: String, required: true, unique: true, trim: true } },
  { timestamps: true }
);

module.exports = mongoose.model("SubCategory", subCategorySchema);
