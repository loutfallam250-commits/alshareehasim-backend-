const mongoose = require("mongoose");

// Coverage entry: one company covers specific cities in a region
const coverageSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: "ShippingCompany", required: true },
    region: { type: String, required: true },   // e.g. "الرياض"
    cities: [{ type: String }],                  // empty = all cities in region
    price: { type: Number, required: true, min: 0 },
    freeShippingThreshold: { type: Number, default: 0 },
    deliveryMinDays: { type: Number, required: true, min: 1 },
    deliveryMaxDays: { type: Number, required: true, min: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Compound index: one company per region (can have multiple city subsets via cities array)
coverageSchema.index({ company: 1, region: 1 }, { unique: true });

module.exports = mongoose.model("ShippingCoverage", coverageSchema);
