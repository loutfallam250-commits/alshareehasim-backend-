/**
 * update-internet-sims.js
 *
 * Updates the 6 internet SIM products already in the database.
 * Run once: node update-internet-sims.js
 *
 * Matching strategy: find by brand + category + approximate price range,
 * then update — never inserts duplicates.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("./models/Product");

const DESC_1Y = `📶 شريحة إنترنت لمدة سنة كاملة
🌐 إنترنت مفتوح لا محدود
✅ استخدام غير عادل
✅ سعر الإنترنت مفتوحة
🌐 غير مقيدة بالموقع، تستطيع التنقل
🎁 راوتر هدية مجانًا
✅ تسجيل الشريحة باسمك
✅ مع ضمان الخدمة حتى انتهاء المدة
🚚 التوصيل خلال 3 أيام عمل
💰 بسعر 1299 ريال فقط`;

const DESC_6M = `📶 شريحة إنترنت لمدة 6 أشهر
🌐 إنترنت مفتوح لا محدود
✅ استخدام غير عادل
✅ سعر الإنترنت مفتوحة
🌐 غير مقيدة بالموقع، تستطيع التنقل
🎁 راوتر هدية مجانًا
✅ تسجيل الشريحة باسمك
✅ مع ضمان الخدمة حتى انتهاء المدة
🚚 التوصيل خلال 3 أيام عمل
💰 بسعر 699 ريال فقط`;

function specs(company) {
  return [
    {
      groupName: "تفاصيل الباقة",
      items: [
        { label: "الشركة", value: company },
        { label: "الشبكة", value: "5G" },
        { label: "الإنترنت", value: "مفتوح لا محدود" },
        { label: "الموقع", value: "غير مقيد" },
        { label: "الراوتر", value: "هدية مجانية" },
        { label: "تسجيل الشريحة", value: "باسم العميل" },
        { label: "الضمان", value: "حتى انتهاء المدة" },
        { label: "التوصيل", value: "خلال 3 أيام عمل" },
      ],
    },
  ];
}

// Each entry: how to FIND the product + what to SET on it.
// sortOrder: within each brand, 1-year (1) comes before 6-month (2).
const UPDATES = [
  // ── Zain ──────────────────────────────────────────────────────────────────
  {
    find: { brand: { $regex: /^zain$/i }, category: "sim-cards", originalPrice: { $gte: 1000 } },
    set: {
      name: "شريحة إنترنت زين 5G مفتوح لا محدود - سنة + راوتر هدية",
      brief: "إنترنت مفتوح لا محدود على شبكة زين 5G لمدة سنة كاملة مع راوتر هدية مجانًا",
      originalPrice: 1299,
      description: DESC_1Y,
      network: "5G",
      deliveryTime: "خلال 3 أيام عمل",
      freeDelivery: true,
      inStock: true,
      isFeatured: true,
      sortOrder: 1,
      specifications: specs("Zain"),
    },
  },
  {
    find: { brand: { $regex: /^zain$/i }, category: "sim-cards", originalPrice: { $lt: 1000 } },
    set: {
      name: "شريحة إنترنت زين 5G مفتوح لا محدود - 6 أشهر + راوتر هدية",
      brief: "إنترنت مفتوح لا محدود على شبكة زين 5G لمدة 6 أشهر مع راوتر هدية مجانًا",
      originalPrice: 699,
      description: DESC_6M,
      network: "5G",
      deliveryTime: "خلال 3 أيام عمل",
      freeDelivery: true,
      inStock: true,
      isFeatured: true,
      sortOrder: 2,
      specifications: specs("Zain"),
    },
  },

  // ── Mobily ────────────────────────────────────────────────────────────────
  {
    find: { brand: { $regex: /mobily|موبايلي/i }, category: "sim-cards", originalPrice: { $gte: 1000 } },
    set: {
      name: "شريحة إنترنت موبايلي 5G مفتوح لا محدود - سنة + راوتر هدية",
      brief: "إنترنت مفتوح لا محدود على شبكة موبايلي 5G لمدة سنة كاملة مع راوتر هدية مجانًا",
      originalPrice: 1299,
      description: DESC_1Y,
      network: "5G",
      deliveryTime: "خلال 3 أيام عمل",
      freeDelivery: true,
      inStock: true,
      isFeatured: true,
      sortOrder: 1,
      specifications: specs("Mobily"),
    },
  },
  {
    find: { brand: { $regex: /mobily|موبايلي/i }, category: "sim-cards", originalPrice: { $lt: 1000 } },
    set: {
      name: "شريحة إنترنت موبايلي 5G مفتوح لا محدود - 6 أشهر + راوتر هدية",
      brief: "إنترنت مفتوح لا محدود على شبكة موبايلي 5G لمدة 6 أشهر مع راوتر هدية مجانًا",
      originalPrice: 699,
      description: DESC_6M,
      network: "5G",
      deliveryTime: "خلال 3 أيام عمل",
      freeDelivery: true,
      inStock: true,
      isFeatured: true,
      sortOrder: 2,
      specifications: specs("Mobily"),
    },
  },

  // ── stc ───────────────────────────────────────────────────────────────────
  {
    find: { brand: { $regex: /^stc$/i }, category: "sim-cards", originalPrice: { $gte: 1000 } },
    set: {
      name: "شريحة إنترنت stc 5G مفتوح لا محدود - سنة + راوتر هدية",
      brief: "إنترنت مفتوح لا محدود على شبكة stc 5G لمدة سنة كاملة مع راوتر هدية مجانًا",
      originalPrice: 1299,
      description: DESC_1Y,
      network: "5G",
      deliveryTime: "خلال 3 أيام عمل",
      freeDelivery: true,
      inStock: true,
      isFeatured: true,
      sortOrder: 1,
      specifications: specs("stc"),
    },
  },
  {
    find: { brand: { $regex: /^stc$/i }, category: "sim-cards", originalPrice: { $lt: 1000 } },
    set: {
      name: "شريحة إنترنت stc 5G مفتوح لا محدود - 6 أشهر + راوتر هدية",
      brief: "إنترنت مفتوح لا محدود على شبكة stc 5G لمدة 6 أشهر مع راوتر هدية مجانًا",
      originalPrice: 699,
      description: DESC_6M,
      network: "5G",
      deliveryTime: "خلال 3 أيام عمل",
      freeDelivery: true,
      inStock: true,
      isFeatured: true,
      sortOrder: 2,
      specifications: specs("stc"),
    },
  },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB connected\n");

  for (const { find, set } of UPDATES) {
    const existing = await Product.findOne(find);
    if (!existing) {
      console.warn(`⚠️  No match found for query:`, JSON.stringify(find));
      continue;
    }
    const oldPrice = existing.originalPrice;
    const oldName = existing.name;
    await Product.findByIdAndUpdate(existing._id, { $set: set });
    console.log(`✅ Updated: "${oldName}" (${oldPrice} SAR) → "${set.name}" (${set.originalPrice} SAR)`);
  }

  console.log("\n✅ Done.");
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error("❌ Error:", e.message);
  mongoose.disconnect();
  process.exit(1);
});
