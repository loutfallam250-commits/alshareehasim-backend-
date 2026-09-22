const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    brief: { type: String },
    originalPrice: { type: Number, required: true },
    salePrice: { type: Number },
    description: { type: String },
    image: { type: String },
    images: [{ type: String }],
    network: { type: String },       // e.g. 4G, 5G
    simType: { type: String },       // e.g. نانو, مايكرو, eSIM
    dataSpeed: { type: String },     // e.g. 150 Mbps
    storage: { type: String },       // للراوترات
    specifications: [
      {
        groupName: String,
        items: [{ label: String, value: String }],
      },
    ],
    rating: {
      average: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    },
    freeDelivery: { type: Boolean, default: true },
    deliveryTime: { type: String, default: "24 ساعة" },
    warrantyYears: { type: Number, default: 1 },
    installment: {
      available: { type: Boolean, default: false },
      downPayment: Number,
      note: String,
      months: Number,
      conditions: [String],
      policy: String,
    },
    taxIncluded: { type: Boolean, default: true },
    category: { type: String, index: true },
    subCategory: { type: String, index: true },
    brand: { type: String },
    inStock: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

productSchema.index({ brand: 1 });

productSchema.virtual("discountPercent").get(function () {
  if (this.salePrice != null && this.salePrice !== this.originalPrice) {
    return Math.round(((this.originalPrice - this.salePrice) / this.originalPrice) * 100);
  }
  return 0;
});

productSchema.virtual("price").get(function () {
  return this.salePrice || this.originalPrice;
});

module.exports = mongoose.model("Product", productSchema);
