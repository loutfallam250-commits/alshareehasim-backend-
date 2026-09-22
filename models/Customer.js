const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const customerSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName:  { type: String, required: true, trim: true, maxlength: 100 },
    email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone:     { type: String, required: true, trim: true, maxlength: 30 },
    password:  { type: String, required: true, minlength: 6 },

    // Whether the account has been verified (OTP confirmed on registration)
    verified: { type: Boolean, default: false },

    // OTP buckets — reused for register, login-by-otp, and forgot-password flows
    pendingOtp: {
      hash:      { type: String,  default: null },
      expiresAt: { type: Date,    default: null },
      attempts:  { type: Number,  default: 0 },
      cooldownUntil: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// Hash password before save
customerSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

customerSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("Customer", customerSchema);
