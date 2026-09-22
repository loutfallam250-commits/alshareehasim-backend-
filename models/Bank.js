const mongoose = require("mongoose");

const bankSchema = new mongoose.Schema({
  name: { type: String, required: true },
  iban: { type: String, required: true },
  logo: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Bank", bankSchema);
