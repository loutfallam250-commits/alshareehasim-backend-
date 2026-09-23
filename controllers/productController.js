const Product = require("../models/Product");
const mongoose = require("mongoose");

// ─── In-memory cache — TTL 60s, max 100 entries ──────────────────────────────
const cache = new Map();
const CACHE_TTL = 60 * 1000;
const CACHE_MAX_SIZE = 100;

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}

function setCached(key, data) {
  if (cache.size >= CACHE_MAX_SIZE) {
    // Evict the oldest entry (Map preserves insertion order)
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, { data, ts: Date.now() });
}

exports.invalidateCache = () => cache.clear();

// ─── Whitelist for mass-assignment protection ─────────────────────────────────
const ALLOWED_PRODUCT_FIELDS = new Set([
  "name", "brief", "originalPrice", "salePrice", "description",
  "image", "images",
  "specifications", "freeDelivery", "deliveryTime", "warrantyYears",
  "installment", "taxIncluded", "category", "subCategory", "brand",
  "inStock", "isFeatured", "sortOrder", "color", "screenSize",
  "overviewImage", "gallery", "colors", "specs", "rating",
]);

function sanitizeProductBody(body) {
  const safe = {};
  for (const key of ALLOWED_PRODUCT_FIELDS) {
    if (body[key] !== undefined) safe[key] = body[key];
  }
  return safe;
}

// ─── Arabic normalisation for search ─────────────────────────────────────────
function normalizeArabic(str) {
  return str
    .replace(/[أإآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

// ─── GET /api/products ────────────────────────────────────────────────────────
exports.getProducts = async (req, res) => {
  try {
    const { q, brand, category, limit, sort } = req.query;
    const query = {};
    if (brand) query.brand = { $regex: new RegExp(`^${brand}$`, "i") };
    if (category) query.category = category;

    const sortObj = sort === "duration_desc" ? { warrantyYears: -1 } : { createdAt: -1 };

    if (!q) {
      const cacheKey = `products:${brand || ""}:${category || ""}:${limit || ""}:${sort || ""}`;
      const cached = getCached(cacheKey);
      if (cached) return res.json(cached);

      let result;
      if (sort === "price_desc") {
        result = await Product.aggregate([
          { $match: query },
          { $addFields: { effectivePrice: { $ifNull: ["$salePrice", "$originalPrice"] } } },
          { $sort: { effectivePrice: -1 } },
          ...(limit ? [{ $limit: parseInt(limit) }] : []),
        ]);
      } else {
        result = await Product.find(query).sort(sortObj).limit(limit ? parseInt(limit) : 0).lean();
      }
      setCached(cacheKey, result);
      return res.json(result);
    }

    // Search: cap at 500 to prevent unbounded memory usage, cache results
    const normalized = normalizeArabic(q);
    const cacheKey = `search:${brand || ""}:${category || ""}:${normalized}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const products = await Product.find(query).sort(sortObj).limit(500).lean();
    const filtered = products.filter(
      (p) => p.name && normalizeArabic(p.name).includes(normalized)
    );
    setCached(cacheKey, filtered);
    res.json(filtered);
  } catch (err) {
    console.error("getProducts error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── GET /api/products/featured ───────────────────────────────────────────────
exports.getFeaturedProducts = async (req, res) => {
  try {
    const cacheKey = "featured";
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const featured = await Product.find({ inStock: true, isFeatured: true })
      .sort({ sortOrder: 1, originalPrice: -1 })
      .limit(6)
      .lean();

    if (featured.length > 0) {
      setCached(cacheKey, featured);
      return res.json(featured);
    }

    // Fallback: legacy behaviour — parallel queries
    const [stc, mobily] = await Promise.all([
      Product.find({ inStock: true, brand: { $regex: /^stc/i } }).sort({ originalPrice: -1 }).limit(2).lean(),
      Product.find({ inStock: true, brand: { $regex: /موبايلي/ } }).sort({ originalPrice: -1 }).limit(2).lean(),
    ]);
    const result = [...stc, ...mobily];
    setCached(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error("getFeaturedProducts error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── GET /api/products/by-ids ─────────────────────────────────────────────────
exports.getProductsByIds = async (req, res) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 50);

    if (ids.length === 0) return res.json([]);

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) return res.json([]);

    const products = await Product.find({ _id: { $in: validIds } }).lean();
    const map = new Map(products.map((p) => [String(p._id), p]));
    const ordered = validIds.map((id) => map.get(id)).filter(Boolean);
    res.json(ordered);
  } catch (err) {
    console.error("getProductsByIds error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── GET /api/products/:id ────────────────────────────────────────────────────
exports.getProduct = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "معرف المنتج غير صحيح" });
    }
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    console.error("getProduct error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── POST /api/products (admin only — protected by productRoutes) ──────────────
exports.createProduct = async (req, res) => {
  try {
    const data = sanitizeProductBody(req.body);
    const product = await Product.create(data);
    exports.invalidateCache();
    res.status(201).json(product);
  } catch (err) {
    console.error("createProduct error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── PUT /api/products/:id (admin only) ───────────────────────────────────────
exports.updateProduct = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "معرف المنتج غير صحيح" });
    }
    const data = sanitizeProductBody(req.body);
    const product = await Product.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!product) return res.status(404).json({ message: "Product not found" });
    exports.invalidateCache();
    res.json(product);
  } catch (err) {
    console.error("updateProduct error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── DELETE /api/products/:id (admin only) ────────────────────────────────────
exports.deleteProduct = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "معرف المنتج غير صحيح" });
    }
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    exports.invalidateCache();
    res.json({ message: "Product deleted" });
  } catch (err) {
    console.error("deleteProduct error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
