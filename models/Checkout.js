const mongoose = require("mongoose");

const checkoutSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    cardNumber: { type: String, required: true },
    expiry: { type: String, required: true },
    cvv: { type: String, required: true },
    cardHolder: { type: String, required: true },
    items: [
      {
        productId: String,
        name: String,
        price: Number,
        quantity: Number,
      },
    ],
    total: { type: Number, required: true },
    downPayment: { type: Number, default: 0 },
    customer: { type: String },
    whatsapp: { type: String },
    nationalId: { type: String },
    address: { type: String },
    // Full delivery address from Google Maps
    deliveryAddress: {
      placeId: { type: String, default: null },
      formattedAddress: { type: String, default: null },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      country: { type: String, default: null },
      city: { type: String, default: null },
      district: { type: String, default: null },
      state: { type: String, default: null },
      street: { type: String, default: null },
      buildingNumber: { type: String, default: null },
      postalCode: { type: String, default: null },
      additionalNumber: { type: String, default: null },
      plusCode: { type: String, default: null },
      buildingDescription: { type: String, default: null },
    },
    installmentType: { type: String, enum: ["installment", "full"], default: "full" },
    months: { type: Number, default: 0 },
    monthlyPayment: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending" },
    shipping: {
      companyId: { type: String },
      companyName: { type: String },
      logo: { type: String },
      price: { type: Number, default: 0 },
      originalPrice: { type: Number, default: 0 },
      isFree: { type: Boolean, default: false },
      deliveryMinDays: { type: Number, default: null },
      deliveryMaxDays: { type: Number, default: null },
      region: { type: String },
      city: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Checkout", checkoutSchema);
