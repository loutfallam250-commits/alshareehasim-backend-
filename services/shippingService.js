const ShippingCoverage = require("../models/ShippingCoverage");

// ─── Simple TTL cache for shipping options (5-minute expiry) ─────────────────
// Shipping data rarely changes — caching avoids a DB hit on every checkout page load
const shippingCache = new Map();
const SHIPPING_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(region, city) {
  return `${region}:${city || ""}`;
}

function getCache(key) {
  const entry = shippingCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > SHIPPING_CACHE_TTL) {
    shippingCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  shippingCache.set(key, { data, ts: Date.now() });
}

/**
 * Call this whenever shipping companies or coverage is updated
 * to ensure stale data is not served.
 */
function invalidateShippingCache() {
  shippingCache.clear();
}

// ─── Public: get all active shipping options for a region/city ────────────────
async function getShippingOptions(region, city, cartTotal = 0) {
  if (!region) return { options: [] };

  const cacheKey = getCacheKey(region, city);
  const cached = getCache(cacheKey);
  if (cached) {
    // Apply cart-total-dependent free shipping logic at read time
    const options = cached.map((c) => {
      const isFree = c.freeShippingThreshold > 0 && cartTotal >= c.freeShippingThreshold;
      return { ...c, price: isFree ? 0 : c.originalPrice, isFree };
    });
    return { options };
  }

  const query = { region, isActive: true };
  if (city) {
    query.$or = [{ cities: { $size: 0 } }, { cities: city }];
  }

  const coverages = await ShippingCoverage.find(query).populate("company", "name logo isActive");
  const active = coverages.filter((c) => c.company?.isActive);

  // Store raw coverage data (without cartTotal-specific pricing) to reuse across cart totals
  const rawOptions = active.map((c) => ({
    companyId: c.company._id,
    companyName: c.company.name,
    logo: c.company.logo,
    originalPrice: c.price,
    freeShippingThreshold: c.freeShippingThreshold,
    delivery: { min: c.deliveryMinDays, max: c.deliveryMaxDays },
    coverageId: c._id,
  }));
  setCache(cacheKey, rawOptions);

  const options = rawOptions.map((c) => {
    const isFree = c.freeShippingThreshold > 0 && cartTotal >= c.freeShippingThreshold;
    return { ...c, price: isFree ? 0 : c.originalPrice, isFree };
  });
  return { options };
}

// ─── Internal: validate a specific company covers a region/city ───────────────
async function validateCoverage(companyId, region, city) {
  const query = { company: companyId, region, isActive: true };
  if (city) {
    query.$or = [{ cities: { $size: 0 } }, { cities: city }];
  }
  const coverage = await ShippingCoverage.findOne(query).populate("company", "name logo isActive");
  if (!coverage || !coverage.company?.isActive) return null;
  return coverage;
}

// ─── Internal: calculate shipping price for checkout ─────────────────────────
async function calculateShippingPrice(companyId, region, city, cartTotal) {
  const coverage = await validateCoverage(companyId, region, city);
  if (!coverage) return null;
  const isFree = coverage.freeShippingThreshold > 0 && cartTotal >= coverage.freeShippingThreshold;
  return {
    price: isFree ? 0 : coverage.price,
    originalPrice: coverage.price,
    isFree,
    companyName: coverage.company.name,
    logo: coverage.company.logo,
    deliveryMinDays: coverage.deliveryMinDays,
    deliveryMaxDays: coverage.deliveryMaxDays,
    coverageId: coverage._id,
  };
}

module.exports = { getShippingOptions, validateCoverage, calculateShippingPrice, invalidateShippingCache };
