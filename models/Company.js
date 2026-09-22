const mongoose = require("mongoose");

const companySchema = new mongoose.Schema({
  nameAr: { type: String, default: "" },
  nameEn: { type: String, default: "" },
  addressAr: { type: String, default: "" },
  addressEn: { type: String, default: "" },
  phone: { type: String, default: "" },
  whatsapp: { type: String, default: "" },
  website: { type: String, default: "" },
  email: { type: String, default: "" },
  currencyAr: { type: String, default: "" },
  currencyEn: { type: String, default: "" },
  taxNumber: { type: String, default: "" },
  shippingCompany: { type: String, default: "" },
  paymentMethod: { type: String, default: "" },
  details: { type: String, default: "" },
  logo: { type: String, default: "" },
  header: { type: String, default: "" },
  footer: { type: String, default: "" },
  stamp: { type: String, default: "" },
  cancelStamp: { type: String, default: "" },
  qrImage: { type: String, default: "" },
  qrLink: { type: String, default: "" },
  img1: { type: String, default: "" },
  link1: { type: String, default: "" },
  link1Type: { type: String, default: "link" },
  file1: { type: String, default: "" },
  img2: { type: String, default: "" },
  link2: { type: String, default: "" },
  link2Type: { type: String, default: "link" },
  file2: { type: String, default: "" },
  footerItems: [
    {
      image: { type: String, default: "" },
      linkType: { type: String, default: "link" },
      link: { type: String, default: "" },
      file: { type: String, default: "" },
    }
  ],
  maintenanceMode: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Company", companySchema);
