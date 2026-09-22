const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const ShippingCompany = require("../models/ShippingCompany");
const ShippingCoverage = require("../models/ShippingCoverage");
const SAUDI_REGIONS = require("../config/saudiRegions");
const { getShippingOptions } = require("../services/shippingService");
const { makeImageUpload, uploadToCloudinary, deleteFromCloudinary } = require("../config/cloudinary");

const uploadLogo = makeImageUpload();

function auth(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: "غير مصرح" });
  try { req.admin = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "غير مصرح" }); }
}

// ── Public ──────────────────────────────────────────────

// GET /api/shipping/regions  — Saudi regions + cities list
router.get("/regions", (_req, res) => res.json(SAUDI_REGIONS));

// GET /api/shipping/options?region=الرياض&city=الرياض&cartTotal=500
router.get("/options", async (req, res) => {
  try {
    const { region, city, cartTotal } = req.query;
    const result = await getShippingOptions(region, city, Number(cartTotal) || 0);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Companies ─────────────────────────────────────

// GET /api/shipping/companies
router.get("/companies", auth, async (_req, res) => {
  try {
    const companies = await ShippingCompany.find().sort({ createdAt: -1 });
    // attach coverage count
    const ids = companies.map(c => c._id);
    const counts = await ShippingCoverage.aggregate([
      { $match: { company: { $in: ids } } },
      { $group: { _id: "$company", count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map(c => [c._id.toString(), c.count]));
    res.json(companies.map(c => ({ ...c.toObject(), coverageCount: countMap[c._id.toString()] || 0 })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/shipping/companies
router.post("/companies", auth, uploadLogo.single("logo"), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "اسم الشركة مطلوب" });
    let logo = "";
    if (req.file) {
      const r = await uploadToCloudinary(req.file.buffer, "shipping");
      logo = r.secure_url;
    }
    const company = await ShippingCompany.create({ name: name.trim(), logo });
    res.status(201).json(company);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/shipping/companies/:id
router.patch("/companies/:id", auth, uploadLogo.single("logo"), async (req, res) => {
  try {
    const company = await ShippingCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ error: "الشركة غير موجودة" });
    if (req.body.name) company.name = req.body.name.trim();
    if (req.body.isActive !== undefined) company.isActive = req.body.isActive === "true" || req.body.isActive === true;
    if (req.file) {
      await deleteFromCloudinary(company.logo);
      const r = await uploadToCloudinary(req.file.buffer, "shipping");
      company.logo = r.secure_url;
    }
    await company.save();
    res.json(company);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/shipping/companies/:id
router.delete("/companies/:id", auth, async (req, res) => {
  try {
    const company = await ShippingCompany.findByIdAndDelete(req.params.id);
    if (!company) return res.status(404).json({ error: "الشركة غير موجودة" });
    await deleteFromCloudinary(company.logo);
    await ShippingCoverage.deleteMany({ company: req.params.id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: Coverage ──────────────────────────────────────

// GET /api/shipping/coverage?companyId=xxx
router.get("/coverage", auth, async (req, res) => {
  try {
    const filter = req.query.companyId ? { company: req.query.companyId } : {};
    const list = await ShippingCoverage.find(filter).populate("company", "name logo").sort({ region: 1 });
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/shipping/coverage
router.post("/coverage", auth, async (req, res) => {
  try {
    const { company, region, cities = [], price, freeShippingThreshold = 0, deliveryMinDays, deliveryMaxDays } = req.body;
    if (!company || !region || price === undefined || !deliveryMinDays || !deliveryMaxDays)
      return res.status(400).json({ error: "جميع الحقول المطلوبة يجب تعبئتها" });

    // Business rule: at least 2 companies per region
    const existing = await ShippingCoverage.countDocuments({ region, isActive: true, company: { $ne: company } });
    // We allow creation; the "min 2" rule is enforced on read/checkout, not on creation of first entry
    // But we warn if this is the only one — frontend handles the display

    const coverage = await ShippingCoverage.create({
      company, region,
      cities: Array.isArray(cities) ? cities : [],
      price: Number(price),
      freeShippingThreshold: Number(freeShippingThreshold),
      deliveryMinDays: Number(deliveryMinDays),
      deliveryMaxDays: Number(deliveryMaxDays),
    });
    await coverage.populate("company", "name logo");
    res.status(201).json(coverage);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "هذه الشركة لديها تغطية لهذه المنطقة بالفعل" });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/shipping/coverage/:id
router.patch("/coverage/:id", auth, async (req, res) => {
  try {
    const { cities, price, freeShippingThreshold, deliveryMinDays, deliveryMaxDays, isActive } = req.body;
    const update = {};
    if (cities !== undefined) update.cities = Array.isArray(cities) ? cities : [];
    if (price !== undefined) update.price = Number(price);
    if (freeShippingThreshold !== undefined) update.freeShippingThreshold = Number(freeShippingThreshold);
    if (deliveryMinDays !== undefined) update.deliveryMinDays = Number(deliveryMinDays);
    if (deliveryMaxDays !== undefined) update.deliveryMaxDays = Number(deliveryMaxDays);
    if (isActive !== undefined) update.isActive = isActive === "true" || isActive === true;

    const coverage = await ShippingCoverage.findByIdAndUpdate(req.params.id, update, { new: true }).populate("company", "name logo");
    if (!coverage) return res.status(404).json({ error: "التغطية غير موجودة" });
    res.json(coverage);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/shipping/coverage/:id
router.delete("/coverage/:id", auth, async (req, res) => {
  try {
    const coverage = await ShippingCoverage.findById(req.params.id);
    if (!coverage) return res.status(404).json({ error: "التغطية غير موجودة" });

    // Business rule: ensure at least 2 companies remain for this region
    const remaining = await ShippingCoverage.countDocuments({
      region: coverage.region,
      isActive: true,
      _id: { $ne: coverage._id },
    });
    if (remaining < 2) {
      return res.status(400).json({ error: "يجب أن يحتوي كل نطاق تغطية على شركتي شحن على الأقل" });
    }

    await ShippingCoverage.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
