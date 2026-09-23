const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Checkout = require("../models/Checkout");
const Product = require("../models/Product");
const { calculateShippingPrice } = require("../services/shippingService");
const { adminAuth } = require("../middleware/auth");

const RATE_LIMIT_MAX = 4;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// In-memory per-user rate limit (first line of defence — stateless)
const userRateLimitMap = new Map();

// Cleanup expired entries every 10 minutes to prevent memory leak
const _rlCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of userRateLimitMap.entries()) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      userRateLimitMap.delete(key);
    }
  }
}, 10 * 60 * 1000);
if (_rlCleanup.unref) _rlCleanup.unref(); // don't keep process alive

function userRateLimit(req, res, next) {
  const { whatsapp, nationalId } = req.body;
  const key = whatsapp || nationalId || req.ip || req.connection?.remoteAddress || "unknown_ip";
  if (!key) return next();

  const now = Date.now();
  const entry = userRateLimitMap.get(key);

  if (entry) {
    const elapsed = now - entry.windowStart;
    if (elapsed < RATE_LIMIT_WINDOW_MS) {
      if (entry.count >= RATE_LIMIT_MAX) {
        const retryAfterMs = RATE_LIMIT_WINDOW_MS - elapsed;
        return res.status(429).json({
          ok: false,
          error: "لقد تجاوزت الحد المسموح به من الطلبات",
          retryAfterMs,
          retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        });
      }
      entry.count++;
    } else {
      userRateLimitMap.set(key, { count: 1, windowStart: now });
    }
  } else {
    userRateLimitMap.set(key, { count: 1, windowStart: now });
  }

  next();
}

// ─── Shared cart validation helper — SINGLE DB QUERY (fixes N+1) ─────────────
async function validateCartItems(items) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { error: "السلة فارغة" };
  }

  // Validate IDs before hitting DB
  const productIds = items.map((i) => i.productId);
  const invalidId = productIds.find((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalidId) {
    return { error: `معرف المنتج غير صحيح: ${invalidId}` };
  }

  // ONE query for all products instead of N queries (N+1 fix)
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  let calculatedTotal = 0;
  const validatedItems = [];

  for (const item of items) {
    const product = productMap.get(String(item.productId));
    if (!product) {
      return { error: `المنتج ${item.productId} غير موجود` };
    }
    if (!product.inStock) {
      return { error: `المنتج "${product.name}" غير متوفر حالياً` };
    }
    const actualPrice = product.salePrice ?? product.originalPrice;
    const itemTotal = actualPrice * (item.quantity || 1);
    calculatedTotal += itemTotal;
    validatedItems.push({
      productId: product._id,
      name: product.name,
      price: actualPrice,
      quantity: item.quantity,
      total: itemTotal,      // only used internally — stripped before saving to DB
    });
  }

  return { validatedItems, calculatedTotal };
}

// ─── POST /api/checkout/validate-cart ────────────────────────────────────────
router.post("/validate-cart", async (req, res) => {
  try {
    const result = await validateCartItems(req.body.items);
    if (result.error) return res.status(400).json({ ok: false, error: result.error });
    res.json({ ok: true, items: result.validatedItems, total: result.calculatedTotal });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/checkout/ ──────────────────────────────────────────────────────
router.post("/", userRateLimit, async (req, res) => {
  try {
    const { whatsapp, nationalId, shipping: shippingInput, items, total } = req.body;

    // Validate & price all items in a single DB query
    const cartResult = await validateCartItems(items);
    if (cartResult.error) {
      return res.status(400).json({ ok: false, error: cartResult.error });
    }
    const { validatedItems, calculatedTotal } = cartResult;

    // Verify each submitted price against DB price (in same order)
    for (let i = 0; i < validatedItems.length; i++) {
      const submitted = items[i];
      const validated = validatedItems[i];
      if (Number(submitted.price) !== validated.price) {
        return res.status(400).json({
          ok: false,
          error: `سعر المنتج "${validated.name}" تم تعديله. يرجى تحديث السلة`,
        });
      }
    }

    // Verify total
    if (Math.abs(calculatedTotal - total) > 0.01) {
      return res.status(400).json({
        ok: false,
        error: `المجموع الإجمالي غير صحيح. المتوقع: ${calculatedTotal} ر.س، المرسل: ${total} ر.س`,
      });
    }

    // DB-level rate limit (stateless fallback — survives restarts)
    if (whatsapp || nationalId) {
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
      const filter = { createdAt: { $gte: since } };
      if (whatsapp) filter.whatsapp = whatsapp;
      else filter.nationalId = nationalId;
      const recentCount = await Checkout.countDocuments(filter);
      if (recentCount >= RATE_LIMIT_MAX) {
        return res.status(429).json({
          ok: false,
          error: "لقد تجاوزت الحد المسموح به من الطلبات",
          retryAfterMs: RATE_LIMIT_WINDOW_MS,
          retryAfterSeconds: RATE_LIMIT_WINDOW_MS / 1000,
        });
      }
    }

    // Server-side shipping validation
    let shippingSnapshot = null;
    const isValidObjectId = (id) => /^[a-f\d]{24}$/i.test(id);

    if (shippingInput?.companyId && shippingInput?.region && isValidObjectId(shippingInput.companyId)) {
      const verified = await calculateShippingPrice(
        shippingInput.companyId,
        shippingInput.region,
        shippingInput.city || "",
        calculatedTotal
      );
      if (!verified) {
        return res.status(400).json({ ok: false, error: "شركة الشحن المختارة لا تغطي هذا العنوان" });
      }
      shippingSnapshot = {
        companyId: shippingInput.companyId,
        companyName: verified.companyName,
        logo: verified.logo,
        price: verified.price,
        originalPrice: verified.originalPrice,
        isFree: verified.isFree,
        deliveryMinDays: verified.deliveryMinDays,
        deliveryMaxDays: verified.deliveryMaxDays,
        region: shippingInput.region,
        city: shippingInput.city || "",
      };
    } else if (shippingInput?.companyId && shippingInput?.companyName) {
      // Fallback for slug-based companyId (not ObjectId)
      shippingSnapshot = {
        companyId: shippingInput.companyId,
        companyName: shippingInput.companyName,
        logo: shippingInput.logo || "",
        price: Number(shippingInput.price) || 0,
        originalPrice: Number(shippingInput.originalPrice) || 0,
        isFree: shippingInput.isFree ?? true,
        deliveryMinDays: shippingInput.deliveryMinDays || null,
        deliveryMaxDays: shippingInput.deliveryMaxDays || null,
        region: shippingInput.region || "",
        city: shippingInput.city || "",
      };
    }

    // Strip internal `total` field from items before saving
    const dbItems = validatedItems.map(({ productId, name, price, quantity }) => ({
      productId, name, price, quantity,
    }));

    const payload = { ...req.body, items: dbItems, total: calculatedTotal };
    if (shippingSnapshot) payload.shipping = shippingSnapshot;

    const checkout = new Checkout(payload);
    await checkout.save();
    res.status(201).json({ ok: true, orderId: checkout.orderId, _id: checkout._id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/checkout/ — admin only, paginated ───────────────────────────────
router.get("/", adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      Checkout.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Checkout.countDocuments(),
    ]);
    res.json({ orders, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/checkout/:id — admin only ──────────────────────────────────────
router.get("/:id", adminAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ ok: false, error: "معرف غير صحيح" });
    }
    const order = await Checkout.findById(req.params.id);
    if (!order) return res.status(404).json({ ok: false, error: "not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/checkout/:id/status — admin only ───────────────────────────────
router.put("/:id/status", adminAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ ok: false, error: "معرف غير صحيح" });
    }
    const order = await Checkout.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    res.json(order);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/checkout/:id/confirm — public, OTP-confirmed orders only ────────
// Security: only transitions pending → confirmed (prevents replay/manipulation)
router.put("/:id/confirm", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ ok: false, error: "معرف غير صحيح" });
    }
    const order = await Checkout.findOneAndUpdate(
      { _id: req.params.id, status: "pending" },  // guard: only pending orders
      { status: "confirmed" },
      { new: true }
    );
    if (!order) {
      return res.status(404).json({ ok: false, error: "الطلب غير موجود أو لم يعد في وضع الانتظار" });
    }
    res.json({ ok: true, orderId: order.orderId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/checkout/:id/financials — admin only ───────────────────────────
router.put("/:id/financials", adminAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ ok: false, error: "معرف غير صحيح" });
    }
    const { total, downPayment, months, monthlyPayment } = req.body;
    const order = await Checkout.findByIdAndUpdate(
      req.params.id,
      { total, downPayment, months, monthlyPayment },
      { new: true }
    );
    res.json(order);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /api/checkout/:id — admin only ────────────────────────────────────
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ ok: false, error: "معرف غير صحيح" });
    }
    const order = await Checkout.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ ok: false, error: "not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
