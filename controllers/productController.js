const Product = require("../models/Product");

// In-memory cache — TTL 60 ثانية
const cache = new Map();
const CACHE_TTL = 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}
function setCached(key, data) {
  cache.set(key, { data, ts: Date.now() });
}
exports.invalidateCache = () => cache.clear();

function normalizeArabic(str) {
  return str
    .replace(/[أإآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

exports.getProducts = async (req, res) => {
  try {
    const { q, brand, category, limit, sort } = req.query;
    const query = {};
    if (brand) query.brand = { $regex: new RegExp(`^${brand}$`, "i") };
    if (category) query.category = category;

    const sortObj = sort === "duration_desc" ? { warrantyYears: -1 } : { createdAt: -1 };

    if (!q) {
      const cacheKey = `products:${brand||''}:${category||''}:${limit||''}:${sort||''}`;
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

    const normalized = normalizeArabic(q);
    const products = await Product.find(query).sort(sortObj).lean();
    const filtered = products.filter((p) => normalizeArabic(p.name).includes(normalized));
    res.json(filtered);
  } catch (err) {
    console.error("getProducts error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getFeaturedProducts = async (req, res) => {
  const featured = await Product.find({ inStock: true, isFeatured: true }).sort({ sortOrder: 1, originalPrice: -1 }).limit(6);
  if (featured.length > 0) return res.json(featured);
  // fallback: legacy behaviour
  const [stc, mobily] = await Promise.all([
    Product.find({ inStock: true, brand: { $regex: /^stc/i } }).sort({ originalPrice: -1 }).limit(2),
    Product.find({ inStock: true, brand: { $regex: /موبايلي/ } }).sort({ originalPrice: -1 }).limit(2),
  ]);
  res.json([...stc, ...mobily]);
};


exports.getProductsByIds = async (req, res) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 50); // hard cap

    if (ids.length === 0) return res.json([]);

    const mongoose = require("mongoose");
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) return res.json([]);

    const products = await Product.find({ _id: { $in: validIds } }).lean();

    // Preserve the order requested by the caller
    const map = new Map(products.map((p) => [String(p._id), p]));
    const ordered = validIds.map((id) => map.get(id)).filter(Boolean);

    res.json(ordered);
  } catch (err) {
    console.error("getProductsByIds error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getProduct = async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json(product);
};

exports.createProduct = async (req, res) => {
  const product = await Product.create(req.body);
  exports.invalidateCache();
  res.status(201).json(product);
};

exports.updateProduct = async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!product) return res.status(404).json({ message: "Product not found" });
  exports.invalidateCache();
  res.json(product);
};

exports.deleteProduct = async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });
  exports.invalidateCache();
  res.json({ message: "Product deleted" });
};
