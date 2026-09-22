const express = require("express");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const Checkout = require("../models/Checkout");
const Product = require("../models/Product");
const { calculateShippingPrice } = require("../services/shippingService");

function authMiddleware(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: "غير مصرح" });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "غير مصرح" });
  }
}

const RATE_LIMIT_MAX = 4;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 دقايق

// Map: key -> { count, windowStart }
const userRateLimitMap = new Map();

function userRateLimit(req, res, next) {
  const { whatsapp, nationalId } = req.body;
  const key = whatsapp || nationalId;
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
      // نافذة جديدة
      userRateLimitMap.set(key, { count: 1, windowStart: now });
    }
  } else {
    userRateLimitMap.set(key, { count: 1, windowStart: now });
  }

  next();
}

// Validate cart endpoint
router.post("/validate-cart", async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: "السلة فارغة" });
    }
    
    let calculatedTotal = 0;
    const validatedItems = [];
    
    for (const item of items) {
      const product = await Product.findById(item.productId);
      
      if (!product) {
        return res.status(400).json({ 
          ok: false, 
          error: `المنتج ${item.productId} غير موجود` 
        });
      }
      
      if (!product.inStock) {
        return res.status(400).json({ 
          ok: false, 
          error: `المنتج "${product.name}" غير متوفر حالياً` 
        });
      }
      
      const actualPrice = product.salePrice ?? product.originalPrice;
      const itemTotal = actualPrice * item.quantity;
      calculatedTotal += itemTotal;
      
      validatedItems.push({
        productId: product._id,
        name: product.name,
        price: actualPrice,
        quantity: item.quantity,
        total: itemTotal
      });
    }
    
    res.json({ 
      ok: true, 
      items: validatedItems, 
      total: calculatedTotal 
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/", userRateLimit, async (req, res) => {
  try {
    const { whatsapp, nationalId, shipping: shippingInput, items, total } = req.body;
    
    // Validate cart on server-side
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: "السلة فارغة" });
    }
    
    let calculatedTotal = 0;
    const validatedItems = [];
    
    for (const item of items) {
      const product = await Product.findById(item.productId);
      
      if (!product) {
        return res.status(400).json({ 
          ok: false, 
          error: `المنتج ${item.productId} غير موجود` 
        });
      }
      
      if (!product.inStock) {
        return res.status(400).json({ 
          ok: false, 
          error: `المنتج "${product.name}" غير متوفر حالياً` 
        });
      }
      
      const actualPrice = product.salePrice ?? product.originalPrice;
      
      // Verify client-side price matches server-side price
      if (Number(item.price) !== actualPrice) {
        return res.status(400).json({ 
          ok: false, 
          error: `سعر المنتج "${product.name}" تم تعديله. يرجى تحديث السلة` 
        });
      }
      
      const itemTotal = actualPrice * item.quantity;
      calculatedTotal += itemTotal;
      
      validatedItems.push({
        productId: product._id,
        name: product.name,
        price: actualPrice,
        quantity: item.quantity
      });
    }
    
    // Verify total price
    const priceDifference = Math.abs(calculatedTotal - total);
    if (priceDifference > 0.01) {
      return res.status(400).json({ 
        ok: false, 
        error: `المجموع الإجمالي غير صحيح. المتوقع: ${calculatedTotal} ر.س، المرسل: ${total} ر.س` 
      });
    }
    
    // DB-level check (double protection in production)
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

    // Server-side shipping validation (only when companyId is a valid ObjectId)
    let shippingSnapshot = null;
    const isValidObjectId = (id) => /^[a-f\d]{24}$/i.test(id);
    if (shippingInput?.companyId && shippingInput?.region && isValidObjectId(shippingInput.companyId)) {
      const cartTotal = calculatedTotal;
      const verified = await calculateShippingPrice(
        shippingInput.companyId,
        shippingInput.region,
        shippingInput.city || "",
        cartTotal
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
      // Fallback: store shipping as-is when companyId is a slug (not ObjectId)
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

    const payload = { ...req.body, items: validatedItems, total: calculatedTotal };
    if (shippingSnapshot) payload.shipping = shippingSnapshot;

    const checkout = new Checkout(payload);
    await checkout.save();
    res.status(201).json({ ok: true, orderId: checkout.orderId, _id: checkout._id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const orders = await Checkout.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const order = await Checkout.findById(req.params.id);
    if (!order) return res.status(404).json({ ok: false, error: "not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put("/:id/status", authMiddleware, async (req, res) => {
  try {
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

// Public confirm after OTP — only allows "confirmed" status
router.put("/:id/confirm", async (req, res) => {
  try {
    const order = await Checkout.findByIdAndUpdate(
      req.params.id,
      { status: "confirmed" },
      { new: true }
    );
    if (!order) return res.status(404).json({ ok: false, error: "not found" });
    res.json({ ok: true, orderId: order.orderId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put("/:id/financials", authMiddleware, async (req, res) => {
  try {
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

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const order = await Checkout.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ ok: false, error: "not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
