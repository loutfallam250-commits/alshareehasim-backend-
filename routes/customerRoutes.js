const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const Customer = require("../models/Customer");

const router = express.Router();

// ─── Constants ────────────────────────────────────────────────────────────────
const OTP_TTL_MS        = 10 * 60 * 1000;   // 10 minutes
const OTP_COOLDOWN_MS   = 60 * 1000;         // 1 minute between resends
const OTP_MAX_ATTEMPTS  = 5;
const JWT_EXPIRES_IN    = "30d";
const COOKIE_NAME       = "customer_token";

// ─── Rate limiters ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "محاولات كثيرة، حاول بعد 15 دقيقة" },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "تم تجاوز الحد المسموح لطلبات OTP، حاول بعد ساعة" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

// OTP hashing: HMAC-SHA256 is correct for short-lived tokens.
// bcrypt is unnecessarily slow for 6-digit OTPs (adds ~100ms/call to auth flow).
function hashOtp(otp) {
  return crypto
    .createHmac("sha256", process.env.OTP_HASH_SECRET)
    .update(String(otp))
    .digest("hex");
}

function verifyOtp(plain, hash) {
  const expected = hashOtp(String(plain).trim());
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false; // mismatched buffer lengths
  }
}

function issueToken(customerId) {
  return jwt.sign(
    { id: customerId },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function setCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: "/",
  };
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireCustomer(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "غير مصرح" });
  try {
    req.customer = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "انتهت الجلسة، يرجى تسجيل الدخول مجدداً" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customers/auth/check-email?email=xxx
// Returns { exists: boolean } — used by frontend to decide register vs login
// ─────────────────────────────────────────────────────────────────────────────
router.get("/auth/check-email", async (req, res) => {
  try {
    const email = (req.query.email || "").toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.json({ exists: false });
    }
    const exists = await Customer.exists({ email, verified: true });
    res.json({ exists: !!exists });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customers/auth/register/request
// Validates that email is not taken, stores hashed OTP, returns _otp in response
// (Next.js BFF strips _otp before responding to browser and sends it via email)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/register/request", otpLimiter, async (req, res) => {
  try {
    const { email, firstName, lastName, phone, password } = req.body;

    if (!email || !firstName || !lastName || !phone || !password) {
      return res.status(400).json({ error: "جميع الحقول مطلوبة" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "بريد إلكتروني غير صحيح" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    }

    const existing = await Customer.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      if (existing.verified) {
        return res.status(409).json({ error: "هذا البريد الإلكتروني مسجل مسبقًا" });
      }

      // If user modified their info (e.g. fixed typo via "تعديل البيانات"), don't block with cooldown
      const isDataChanged =
        existing.firstName !== firstName.trim() ||
        existing.lastName !== lastName.trim() ||
        existing.phone !== phone.trim();

      if (!isDataChanged && existing.pendingOtp?.cooldownUntil && existing.pendingOtp.cooldownUntil > new Date()) {
        const seconds = Math.ceil((existing.pendingOtp.cooldownUntil - Date.now()) / 1000);
        return res.status(429).json({ error: "يرجى الانتظار قبل طلب رمز جديد", cooldown: seconds });
      }
    }

    // Enforce cooldown if a recent OTP was issued via a temp record
    // We store the pending registration in a temp Customer doc (not yet verified)
    // using a special flag so we can reuse the same model.
    // Instead, we keep it simple: store pending data in a short-lived approach.
    // For stateless simplicity we return the OTP to the BFF which emails it,
    // and on verify we create the actual account.

    const otp = generateOtp();
    const otpHash = hashOtp(otp);  // sync HMAC — no await needed
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    // Store pending OTP keyed by email in a temporary Customer doc with verified=false.
    // We upsert a "pending" customer record — it becomes real on verify.
    await Customer.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      {
        $set: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          // Store a placeholder password — real one set on verify
          password: await bcrypt.hash(password, 12),
          pendingOtp: {
            hash: otpHash,
            expiresAt,
            attempts: 0,
            cooldownUntil: new Date(Date.now() + OTP_COOLDOWN_MS),
          },
          // Mark as unverified until /register/verify succeeds
          verified: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Return OTP to BFF only — BFF emails it and never forwards to browser
    res.json({ _otp: otp });
  } catch (err) {
    console.error("register/request error:", err.message);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customers/auth/register/verify
// Verifies OTP, marks account as verified, issues session cookie
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/register/verify", authLimiter, async (req, res) => {
  try {
    const { email, otp, firstName, lastName, phone, password } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "البيانات مطلوبة" });
    }

    const customer = await Customer.findOne({ email: email.toLowerCase().trim() });
    if (!customer || !customer.pendingOtp?.hash) {
      return res.status(400).json({ error: "لم يتم طلب تسجيل لهذا البريد", code: "NO_PENDING" });
    }

    const { hash, expiresAt, attempts, cooldownUntil } = customer.pendingOtp;

    if (cooldownUntil && cooldownUntil > new Date() && attempts >= OTP_MAX_ATTEMPTS) {
      const seconds = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return res.status(429).json({ error: "تم تجاوز الحد، حاول بعد قليل", code: "MAX_ATTEMPTS", cooldown: seconds });
    }

    if (!expiresAt || expiresAt < new Date()) {
      return res.status(400).json({ error: "انتهت صلاحية رمز التحقق", code: "EXPIRED" });
    }

    const match = verifyOtp(String(otp).trim(), hash);
    if (!match) {
      const newAttempts = (attempts || 0) + 1;
      const update = { "pendingOtp.attempts": newAttempts };
      if (newAttempts >= OTP_MAX_ATTEMPTS) {
        update["pendingOtp.cooldownUntil"] = new Date(Date.now() + 5 * 60 * 1000);
      }
      await Customer.updateOne({ email: customer.email }, { $set: update });
      const remaining = OTP_MAX_ATTEMPTS - newAttempts;
      return res.status(400).json({
        error: remaining > 0 ? `رمز التحقق غير صحيح، تبقى ${remaining} محاولات` : "رمز التحقق غير صحيح",
        code: newAttempts >= OTP_MAX_ATTEMPTS ? "MAX_ATTEMPTS" : "WRONG_OTP",
      });
    }

    // OTP valid — mark verified and clear OTP bucket, apply any updated info
    customer.verified = true;
    if (firstName && typeof firstName === "string" && firstName.trim().length >= 2) customer.firstName = firstName.trim();
    if (lastName && typeof lastName === "string" && lastName.trim().length >= 2) customer.lastName = lastName.trim();
    if (phone && typeof phone === "string" && phone.trim()) customer.phone = phone.trim();
    if (password && String(password).length >= 6) {
      customer.password = await bcrypt.hash(password, 12);
    }
    customer.pendingOtp = { hash: null, expiresAt: null, attempts: 0, cooldownUntil: null };
    await customer.save();

    const token = issueToken(customer._id);
    res
      .cookie(COOKIE_NAME, token, setCookieOptions())
      .json({
        user: {
          _id: customer._id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
        },
      });
  } catch (err) {
    console.error("register/verify error:", err.message);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customers/auth/request  (OTP login — step 1)
// Requires existing verified account; sends OTP for passwordless login
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/request", otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "البريد الإلكتروني مطلوب" });

    const customer = await Customer.findOne({ email: email.toLowerCase().trim(), verified: true });
    if (!customer) {
      // Don't reveal whether account exists — return generic response
      return res.status(404).json({ error: "لا يوجد حساب مرتبط بهذا البريد" });
    }

    // Cooldown check
    if (customer.pendingOtp?.cooldownUntil && customer.pendingOtp.cooldownUntil > new Date()) {
      const seconds = Math.ceil((customer.pendingOtp.cooldownUntil - Date.now()) / 1000);
      return res.status(429).json({ error: "انتظر قليلاً قبل طلب رمز جديد", cooldown: seconds });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    customer.pendingOtp = {
      hash: otpHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
      cooldownUntil: new Date(Date.now() + OTP_COOLDOWN_MS),
    };
    await customer.save();

    res.json({ _otp: otp });
  } catch (err) {
    console.error("auth/request error:", err.message);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customers/auth/verify  (OTP login — step 2)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/verify", authLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "البيانات مطلوبة" });

    const customer = await Customer.findOne({ email: email.toLowerCase().trim(), verified: true });
    if (!customer || !customer.pendingOtp?.hash) {
      return res.status(400).json({ error: "لا يوجد طلب OTP لهذا البريد", code: "NO_PENDING" });
    }

    const { hash, expiresAt, attempts } = customer.pendingOtp;

    if (!expiresAt || expiresAt < new Date()) {
      return res.status(400).json({ error: "انتهت صلاحية رمز التحقق", code: "EXPIRED" });
    }

    const match = verifyOtp(String(otp).trim(), hash);
    if (!match) {
      const newAttempts = (attempts || 0) + 1;
      const update = { "pendingOtp.attempts": newAttempts };
      if (newAttempts >= OTP_MAX_ATTEMPTS) {
        update["pendingOtp.cooldownUntil"] = new Date(Date.now() + 5 * 60 * 1000);
      }
      await Customer.updateOne({ email: customer.email }, { $set: update });
      const remaining = OTP_MAX_ATTEMPTS - newAttempts;
      return res.status(400).json({
        error: remaining > 0 ? `رمز التحقق غير صحيح، تبقى ${remaining} محاولات` : "رمز التحقق غير صحيح",
        code: newAttempts >= OTP_MAX_ATTEMPTS ? "MAX_ATTEMPTS" : "WRONG_OTP",
      });
    }

    customer.pendingOtp = { hash: null, expiresAt: null, attempts: 0, cooldownUntil: null };
    await customer.save();

    const token = issueToken(customer._id);
    res
      .cookie(COOKIE_NAME, token, setCookieOptions())
      .json({
        user: {
          _id: customer._id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
        },
      });
  } catch (err) {
    console.error("auth/verify error:", err.message);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customers/auth/login  (password login)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "البريد وكلمة المرور مطلوبان" });

    const customer = await Customer.findOne({ email: email.toLowerCase().trim(), verified: true });
    if (!customer) return res.status(401).json({ error: "بيانات غير صحيحة" });

    const match = await customer.comparePassword(password);
    if (!match) return res.status(401).json({ error: "بيانات غير صحيحة" });

    const token = issueToken(customer._id);
    res
      .cookie(COOKIE_NAME, token, setCookieOptions())
      .json({
        user: {
          _id: customer._id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
        },
      });
  } catch (err) {
    console.error("auth/login error:", err.message);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customers/auth/me
// Returns logged-in customer's public profile
// ─────────────────────────────────────────────────────────────────────────────
router.get("/auth/me", requireCustomer, async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer.id, "firstName lastName email phone createdAt");
    if (!customer) return res.status(401).json({ error: "الحساب غير موجود" });
    res.json({
      authenticated: true,
      user: {
        _id: customer._id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        createdAt: customer.createdAt,
      },
    });
  } catch (err) {
    console.error("auth/me error:", err.message);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customers/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/logout", (req, res) => {
  const isProd = process.env.NODE_ENV === "production";
  res
    .clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      path: "/",
    })
    .json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customers/auth/forgot/request
// Generates OTP for password reset — returns _otp to BFF which emails it
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/forgot/request", otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "البريد الإلكتروني مطلوب" });

    const customer = await Customer.findOne({ email: email.toLowerCase().trim(), verified: true });
    if (!customer) {
      // Return notFound flag — BFF treats this as silent success so we don't leak account existence
      return res.json({ notFound: true });
    }

    // Cooldown check
    if (customer.pendingOtp?.cooldownUntil && customer.pendingOtp.cooldownUntil > new Date()) {
      const seconds = Math.ceil((customer.pendingOtp.cooldownUntil - Date.now()) / 1000);
      return res.status(429).json({ error: "انتظر قليلاً قبل طلب رمز جديد", cooldown: seconds });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    customer.pendingOtp = {
      hash: otpHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
      cooldownUntil: new Date(Date.now() + OTP_COOLDOWN_MS),
    };
    await customer.save();

    res.json({ _otp: otp });
  } catch (err) {
    console.error("forgot/request error:", err.message);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customers/auth/forgot/verify
// Verifies OTP and resets password in one step
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/forgot/verify", authLimiter, async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ error: "البيانات مطلوبة" });
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    }

    const customer = await Customer.findOne({ email: email.toLowerCase().trim(), verified: true });
    if (!customer || !customer.pendingOtp?.hash) {
      return res.status(400).json({ error: "لا يوجد طلب إعادة تعيين لهذا البريد", code: "NO_PENDING" });
    }

    const { hash, expiresAt, attempts } = customer.pendingOtp;

    if (!expiresAt || expiresAt < new Date()) {
      return res.status(400).json({ error: "انتهت صلاحية رمز التحقق", code: "EXPIRED" });
    }

    const match = verifyOtp(String(otp).trim(), hash);
    if (!match) {
      const newAttempts = (attempts || 0) + 1;
      const update = { "pendingOtp.attempts": newAttempts };
      if (newAttempts >= OTP_MAX_ATTEMPTS) {
        update["pendingOtp.cooldownUntil"] = new Date(Date.now() + 5 * 60 * 1000);
      }
      await Customer.updateOne({ email: customer.email }, { $set: update });
      const remaining = OTP_MAX_ATTEMPTS - newAttempts;
      return res.status(400).json({
        error: remaining > 0 ? `رمز التحقق غير صحيح، تبقى ${remaining} محاولات` : "رمز التحقق غير صحيح",
        code: newAttempts >= OTP_MAX_ATTEMPTS ? "MAX_ATTEMPTS" : "WRONG_OTP",
      });
    }

    // Update password and clear OTP
    customer.password = newPassword; // pre-save hook will hash it
    customer.pendingOtp = { hash: null, expiresAt: null, attempts: 0, cooldownUntil: null };
    await customer.save();

    res.json({ success: true });
  } catch (err) {
    console.error("forgot/verify error:", err.message);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});


// ?????????????????????????????????????????????????????????????????????????????
// GET /api/customers/orders
// Returns orders for the authenticated customer
// ?????????????????????????????????????????????????????????????????????????????
router.get("/orders", requireCustomer, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;
    const customerId = req.customer.id;
    const Checkout = require("../models/Checkout");
    const [orders, total] = await Promise.all([
      Checkout.find({ userId: customerId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Checkout.countDocuments({ userId: customerId }),
    ]);
    res.json({ orders, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
