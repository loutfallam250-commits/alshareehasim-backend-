const ShippingCoverage = require("../models/ShippingCoverage");

async function getShippingOptions(region, city, cartTotal = 0) {
  if (!region) return { options: [] };

  const query = { region, isActive: true };
  if (city) {
    query.$or = [{ cities: { $size: 0 } }, { cities: city }];
  }

  const coverages = await ShippingCoverage.find(query).populate("company", "name logo isActive");
  const active = coverages.filter(c => c.company?.isActive);

  const options = active.map(c => {
    const isFree = c.freeShippingThreshold > 0 && cartTotal >= c.freeShippingThreshold;
    return {
      companyId: c.company._id,
      companyName: c.company.name,
      logo: c.company.logo,
      price: isFree ? 0 : c.price,
      originalPrice: c.price,
      isFree,
      freeShippingThreshold: c.freeShippingThreshold,
      delivery: { min: c.deliveryMinDays, max: c.deliveryMaxDays },
      coverageId: c._id,
    };
  });

  return { options };
}

async function validateCoverage(companyId, region, city) {
  const query = { company: companyId, region, isActive: true };
  if (city) {
    query.$or = [{ cities: { $size: 0 } }, { cities: city }];
  }
  const coverage = await ShippingCoverage.findOne(query).populate("company", "name logo isActive");
  if (!coverage || !coverage.company?.isActive) return null;
  return coverage;
}

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

module.exports = { getShippingOptions, validateCoverage, calculateShippingPrice };
