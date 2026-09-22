# Backend — توثيق شامل

## نظرة عامة

باك إند مبني بـ **Node.js + Express + MongoDB (Mongoose)**، يخدم متجر إلكتروني لبيع الجوالات.  
يتضمن نظام مصادقة للأدمن، إدارة منتجات، طلبات، بانرات، تقييمات، وإعدادات الشركة.

---

## التقنيات المستخدمة

| الحزمة | الغرض |
|---|---|
| express | إطار العمل الرئيسي |
| mongoose | التواصل مع MongoDB |
| jsonwebtoken | مصادقة JWT |
| bcryptjs | تشفير كلمات المرور |
| cloudinary | رفع وحذف الصور |
| multer | استقبال الملفات من الفورم |
| cookie-parser | قراءة الكوكيز |
| cors | السماح للفرونت إند بالوصول |
| express-rate-limit | تحديد عدد الطلبات |
| dotenv | متغيرات البيئة |

---

## متغيرات البيئة `.env`

```
MONGO_URI=           # رابط قاعدة البيانات MongoDB
JWT_SECRET=          # مفتاح سري لتوقيع JWT
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
FRONTEND_URL=        # رابط الفرونت (يقبل أكثر من رابط مفصول بفاصلة)
PORT=5000
NODE_ENV=production  # أو development
```

---

## تشغيل المشروع

```bash
npm install
npm run dev     # تطوير (nodemon)
npm start       # إنتاج
```

---

## هيكل الملفات

```
Backend/
├── config/
│   ├── db.js               # الاتصال بـ MongoDB
│   └── cloudinary.js       # إعداد Cloudinary + multer
├── controllers/
│   └── productController.js
├── models/
│   ├── Admin.js
│   ├── Bank.js
│   ├── Banner.js
│   ├── CardFieldSettings.js
│   ├── CategoryBanner.js
│   ├── Checkout.js
│   ├── Company.js
│   ├── MainCategory.js
│   ├── Product.js
│   ├── Review.js
│   ├── SubCategory.js
│   └── SubCategorySettings.js
├── routes/
│   ├── adminRoutes.js
│   ├── checkoutRoutes.js
│   └── productRoutes.js
├── seed.js
├── seed-admin.js
├── seed-full.js
├── seed-products.js
└── server.js
```

---

## ملفات Config

### `config/db.js`
يتصل بـ MongoDB عبر `MONGO_URI`، وإذا فشل الاتصال يوقف السيرفر.

### `config/cloudinary.js`
- يضبط إعدادات Cloudinary من متغيرات البيئة.
- `makeImageUpload()` — multer للصور بحد 5MB.
- `makeFileUpload()` — multer للملفات بحد 20MB.
- `uploadToCloudinary(buffer, folder, options)` — يرفع ملف من الذاكرة مباشرة لـ Cloudinary.
- `deleteFromCloudinary(url, resource_type)` — يحذف ملف من Cloudinary عبر استخراج الـ public_id من الرابط.

---

## Models (نماذج قاعدة البيانات)

### `Admin.js`
حساب الأدمن.

| الحقل | النوع | الوصف |
|---|---|---|
| name | String | الاسم |
| phone | String | رقم الهاتف |
| email | String | البريد (unique) |
| password | String | مشفر تلقائياً بـ bcrypt (12 rounds) |
| loginAttempts | Number | عدد محاولات الدخول الفاشلة |
| lockUntil | Date | وقت انتهاء القفل |

- **Pre-save hook**: يشفر الباسورد تلقائياً عند الحفظ.
- **comparePassword(plain)**: يقارن الباسورد المدخل بالمشفر.
- **isLocked()**: يتحقق إذا كان الحساب مقفلاً.

---

### `Product.js`
المنتج الرئيسي.

| الحقل | النوع | الوصف |
|---|---|---|
| name | String | اسم المنتج |
| originalPrice | Number | السعر الأصلي |
| salePrice | Number | سعر البيع (اختياري) |
| description | String | الوصف |
| image | String | رابط الصورة الرئيسية |
| images | [String] | صور إضافية |
| color | String | اللون |
| storage | String | السعة التخزينية |
| network | String | الشبكة (4G/5G) |
| screenSize | String | حجم الشاشة |
| specs | Object | المواصفات التفصيلية (شاشة، معالج، رام، كاميرا...) |
| freeDelivery | Boolean | توصيل مجاني (افتراضي: true) |
| deliveryTime | String | وقت التوصيل (افتراضي: "24 ساعة") |
| warrantyYears | Number | سنوات الضمان (افتراضي: 2) |
| installment | Object | إعدادات التقسيط (متاح، دفعة أولى، ملاحظة، أشهر) |
| taxIncluded | Boolean | الضريبة مشمولة |
| category | String | التصنيف الرئيسي |
| subCategory | String | التصنيف الفرعي |
| brand | String | الماركة |
| inStock | Boolean | متوفر في المخزن |

**Virtuals:**
- `discountPercent` — نسبة الخصم محسوبة تلقائياً.
- `price` — يرجع `salePrice` إن وُجد وإلا `originalPrice`.

---

### `Checkout.js`
طلب الشراء.

| الحقل | النوع | الوصف |
|---|---|---|
| orderId | String | رقم الطلب (unique) |
| cardNumber | String | رقم البطاقة |
| expiry | String | تاريخ الانتهاء |
| cvv | String | رمز CVV |
| cardHolder | String | اسم حامل البطاقة |
| items | Array | المنتجات (id، اسم، سعر، كمية) |
| total | Number | المجموع |
| downPayment | Number | الدفعة الأولى |
| customer | String | اسم العميل |
| whatsapp | String | رقم واتساب |
| nationalId | String | رقم الهوية |
| address | String | العنوان |
| installmentType | String | نوع الدفع: `installment` أو `full` |
| months | Number | عدد الأشهر |
| monthlyPayment | Number | القسط الشهري |
| status | String | الحالة: `pending` / `confirmed` / `cancelled` |

---

### `Company.js`
بيانات الشركة والإعدادات العامة.

| الحقل | الوصف |
|---|---|
| nameAr / nameEn | اسم الشركة عربي/إنجليزي |
| addressAr / addressEn | العنوان |
| phone / whatsapp / email / website | بيانات التواصل |
| currencyAr / currencyEn | العملة |
| taxNumber | الرقم الضريبي |
| shippingCompany | شركة الشحن |
| paymentMethod | طريقة الدفع |
| details | تفاصيل إضافية |
| logo / header / footer / stamp | صور الشركة (روابط Cloudinary) |
| qrImage / qrLink | صورة QR ورابطه |
| img1, link1, link1Type, file1 | عنصر تسويقي 1 |
| img2, link2, link2Type, file2 | عنصر تسويقي 2 |
| footerItems | مصفوفة عناصر الفوتر (صورة، رابط، ملف) |

---

### `Banner.js`
بانرات الصفحة الرئيسية.
- يحتوي على مصفوفة `banners` (افتراضي 5 بانرات).
- كل بانر: `{ url: String, active: Boolean }`.

---

### `CategoryBanner.js`
بانرات خاصة بكل تصنيف.
- `category` (unique) — اسم التصنيف.
- `banners` — مصفوفة بانرات مثل Banner.

---

### `MainCategory.js`
التصنيفات الرئيسية (المستقلة عن المنتجات).
- `name` (unique, required).

---

### `SubCategory.js`
التصنيفات الفرعية المستقلة.
- `name` (unique, required).

---

### `SubCategorySettings.js`
إعدادات ظهور التصنيفات الفرعية في الصفحة الرئيسية.

| الحقل | الوصف |
|---|---|
| category | اسم التصنيف الرئيسي |
| subCategory | اسم التصنيف الفرعي |
| showInHome | هل يظهر في الهوم |
| order | ترتيب الظهور |

- Index مركب unique على `(category, subCategory)`.
- يُستخدم أيضاً بـ `category: "__config__"` لتخزين إعداد `max` (أقصى عدد تصنيفات في الهوم).

---

### `Bank.js`
بيانات البنوك للتحويل.
- `name`, `iban`, `logo` (رابط Cloudinary).

---

### `Review.js`
تقييمات العملاء.

| الحقل | الوصف |
|---|---|
| name | اسم المقيّم |
| comment | التعليق |
| rating | التقييم 1-5 |
| gender | `male` أو `female` |
| approved | هل تمت الموافقة (افتراضي: false) |

---

### `CardFieldSettings.js`
إعدادات حقول بطاقة الدفع.
- `showExpiryDate` — إظهار تاريخ الانتهاء.
- `showCvv` — إظهار CVV.

---

## Controllers

### `controllers/productController.js`

| الدالة | الوصف |
|---|---|
| `getProducts` | جلب كل المنتجات، مع دعم البحث بـ `?q=` مع تطبيع الحروف العربية |
| `getProduct` | جلب منتج واحد بالـ ID |
| `createProduct` | إنشاء منتج مع التحقق أن `salePrice < originalPrice` |
| `updateProduct` | تحديث منتج مع نفس التحقق |
| `deleteProduct` | حذف منتج |

**ملاحظة:** `normalizeArabic()` تُوحّد الحروف المتشابهة (أ/إ/آ → ا، ى/ي → ي، ة → ه) لتحسين نتائج البحث.

---

## Routes

### `routes/productRoutes.js` — `/api/products`

| Method | Path | الوصف |
|---|---|---|
| GET | `/api/products` | جلب كل المنتجات (يقبل `?q=` للبحث) |
| POST | `/api/products` | إنشاء منتج |
| GET | `/api/products/:id` | جلب منتج واحد |
| PUT | `/api/products/:id` | تحديث منتج |
| DELETE | `/api/products/:id` | حذف منتج |

---

### `routes/checkoutRoutes.js` — `/api/checkout`

| Method | Path | Auth | الوصف |
|---|---|---|---|
| POST | `/api/checkout` | لا | إنشاء طلب جديد |
| GET | `/api/checkout` | لا | جلب كل الطلبات |
| GET | `/api/checkout/:id` | لا | جلب طلب واحد |
| PUT | `/api/checkout/:id/status` | أدمن | تحديث حالة الطلب |
| PUT | `/api/checkout/:id/financials` | أدمن | تحديث البيانات المالية (total, downPayment, months, monthlyPayment) |
| DELETE | `/api/checkout/:id` | أدمن | حذف طلب |

---

### `routes/adminRoutes.js` — `/api/admin`

#### المصادقة
| Method | Path | Auth | الوصف |
|---|---|---|---|
| POST | `/api/admin/login` | لا | تسجيل دخول (rate limit: 5 محاولات/15 دقيقة) |
| POST | `/api/admin/logout` | لا | تسجيل خروج (يمسح الكوكي) |
| GET | `/api/admin/verify` | لا | التحقق من صلاحية التوكن |

**آلية القفل:** بعد 5 محاولات فاشلة، يُقفل الحساب 15 دقيقة.  
**التوكن:** JWT مدته 8 ساعات، يُخزن في HttpOnly Cookie.

#### إدارة المستخدمين (أدمن)
| Method | Path | الوصف |
|---|---|---|
| GET | `/api/admin/users` | جلب كل الأدمنز |
| POST | `/api/admin/users` | إضافة أدمن جديد |
| PUT | `/api/admin/users/:id` | تعديل أدمن |
| DELETE | `/api/admin/users/:id` | حذف أدمن (لا يمكن حذف آخر أدمن) |

#### إعدادات الشركة
| Method | Path | Auth | الوصف |
|---|---|---|---|
| GET | `/api/admin/company` | لا | جلب بيانات الشركة |
| PUT | `/api/admin/company` | أدمن | تحديث بيانات الشركة |
| POST | `/api/admin/company/upload/:field` | أدمن | رفع صورة (logo/header/footer/stamp) |
| DELETE | `/api/admin/company/image/:field` | أدمن | حذف صورة |
| POST | `/api/admin/company/footer-image/:key` | أدمن | رفع صورة فوتر (qrImage/img1/img2) |
| POST | `/api/admin/company/footer-file/:key` | أدمن | رفع ملف فوتر (file1/file2) |
| POST | `/api/admin/company/footer-items/image/:index` | أدمن | رفع صورة عنصر فوتر |
| POST | `/api/admin/company/footer-items/file/:index` | أدمن | رفع ملف عنصر فوتر |
| POST | `/api/admin/company/footer-items/add` | أدمن | إضافة عنصر فوتر |
| DELETE | `/api/admin/company/footer-items/:index` | أدمن | حذف عنصر فوتر |

#### البانرات الرئيسية
| Method | Path | Auth | الوصف |
|---|---|---|---|
| GET | `/api/admin/banners` | لا | جلب البانرات |
| POST | `/api/admin/banners/upload/:index` | أدمن | رفع صورة بانر |
| PATCH | `/api/admin/banners/toggle/:index` | أدمن | تفعيل/تعطيل بانر |
| POST | `/api/admin/banners/add` | أدمن | إضافة بانر (حد أقصى 10) |
| DELETE | `/api/admin/banners/:index/image` | أدمن | مسح صورة البانر فقط |
| DELETE | `/api/admin/banners/:index` | أدمن | حذف البانر كاملاً |

#### بانرات التصنيفات
| Method | Path | Auth | الوصف |
|---|---|---|---|
| GET | `/api/admin/category-banners-bulk?categories=` | لا | جلب بانرات عدة تصنيفات دفعة واحدة |
| GET | `/api/admin/category-banners/:category` | لا | جلب بانرات تصنيف |
| POST | `/api/admin/category-banners/:category/upload/:index` | أدمن | رفع صورة |
| PATCH | `/api/admin/category-banners/:category/toggle/:index` | أدمن | تفعيل/تعطيل |
| POST | `/api/admin/category-banners/:category/add` | أدمن | إضافة بانر |
| DELETE | `/api/admin/category-banners/:category/:index/image` | أدمن | مسح الصورة |
| DELETE | `/api/admin/category-banners/:category/:index` | أدمن | حذف البانر |

#### التصنيفات الرئيسية (subCategory في المنتج)
| Method | Path | Auth | الوصف |
|---|---|---|---|
| GET | `/api/admin/main-categories` | أدمن | تصنيفات من المنتجات مع العدد |
| GET | `/api/admin/main-categories/extra` | أدمن | كل التصنيفات (منتجات + MainCategory) |
| POST | `/api/admin/main-categories` | أدمن | إضافة تصنيف |
| PUT | `/api/admin/main-categories/rename` | أدمن | إعادة تسمية |
| DELETE | `/api/admin/main-categories/remove` | أدمن | حذف |

#### التصنيفات الفرعية (category في المنتج)
| Method | Path | Auth | الوصف |
|---|---|---|---|
| GET | `/api/admin/sub-categories` | أدمن | تصنيفات من المنتجات |
| GET | `/api/admin/sub-categories/all` | أدمن | كل MainCategory |
| GET | `/api/admin/sub-categories/extra` | أدمن | SubCategory غير موجودة في منتجات |
| GET | `/api/admin/sub-categories/public` | لا | للفرونت (مع صورة) |
| GET | `/api/admin/sub-categories/home-settings` | لا | إعدادات الهوم |
| GET | `/api/admin/sub-categories/max` | لا | أقصى عدد تصنيفات في الهوم |
| PATCH | `/api/admin/sub-categories/max` | أدمن | تعديل الحد الأقصى |
| POST | `/api/admin/sub-categories` | أدمن | إضافة تصنيف فرعي |
| PUT | `/api/admin/sub-categories/rename` | أدمن | إعادة تسمية |
| DELETE | `/api/admin/sub-categories/remove` | أدمن | حذف |
| PATCH | `/api/admin/sub-categories/settings/toggle` | أدمن | تفعيل/تعطيل الظهور في الهوم |
| PATCH | `/api/admin/sub-categories/settings/order` | أدمن | تعديل الترتيب |

#### الطلبات
| Method | Path | Auth | الوصف |
|---|---|---|---|
| GET | `/api/admin/orders` | لا | جلب كل الطلبات |
| PUT | `/api/admin/orders/:id/status` | أدمن | تحديث الحالة |
| DELETE | `/api/admin/orders/:id` | أدمن | حذف طلب |

#### التقييمات
| Method | Path | Auth | الوصف |
|---|---|---|---|
| GET | `/api/admin/reviews` | لا | التقييمات المعتمدة فقط |
| GET | `/api/admin/reviews/all` | أدمن | كل التقييمات |
| POST | `/api/admin/reviews` | لا | إضافة تقييم (يحتاج موافقة) |
| POST | `/api/admin/reviews/admin-add` | أدمن | إضافة تقييم مباشر |
| PUT | `/api/admin/reviews/:id` | أدمن | تعديل تقييم |
| PATCH | `/api/admin/reviews/:id/approve` | أدمن | اعتماد تقييم |
| PATCH | `/api/admin/reviews/:id/toggle` | أدمن | تبديل حالة الاعتماد |
| DELETE | `/api/admin/reviews/:id` | أدمن | حذف تقييم |

#### المنتجات (من adminRoutes)
| Method | Path | Auth | الوصف |
|---|---|---|---|
| GET | `/api/admin/products` | أدمن | قائمة مختصرة |
| GET | `/api/admin/products/:id` | أدمن | تفاصيل منتج |
| POST | `/api/admin/products` | أدمن | إضافة منتج مع رفع صورة |
| PUT | `/api/admin/products/:id` | أدمن | تعديل منتج مع رفع صورة |
| DELETE | `/api/admin/products/:id` | أدمن | حذف منتج وصورته من Cloudinary |

#### البنوك
| Method | Path | Auth | الوصف |
|---|---|---|---|
| GET | `/api/admin/banks` | أدمن | جلب البنوك |
| POST | `/api/admin/banks` | أدمن | إضافة بنك مع لوجو |
| PUT | `/api/admin/banks/:id` | أدمن | تعديل بنك |
| DELETE | `/api/admin/banks/:id` | أدمن | حذف بنك وصورته |

#### إعدادات حقول البطاقة
| Method | Path | Auth | الوصف |
|---|---|---|---|
| GET | `/api/admin/card-field-settings` | لا | جلب الإعدادات |
| PATCH | `/api/admin/card-field-settings` | أدمن | تبديل `showExpiryDate` أو `showCvv` |

---

## ملفات Seed

| الملف | الوصف |
|---|---|
| `seed-admin.js` | ينشئ حساب أدمن افتراضي (`admin@basmat.com` / `Mohammed123`) |
| `seed.js` | يضيف منتج iPhone 17 Pro Max تجريبي |
| `seed-products.js` | بيانات منتجات إضافية |
| `seed-full.js` | seed شامل للبيانات الكاملة |

```bash
node seed-admin.js    # إنشاء الأدمن
node seed.js          # إضافة منتج تجريبي
```

---

## `server.js` — نقطة الدخول

- يتصل بـ MongoDB.
- يضبط CORS ليقبل الأصول المحددة في `FRONTEND_URL`.
- يقبل JSON وـ URL-encoded بحد 10MB.
- يخدم مجلد `uploads/` كملفات ثابتة.
- يسجّل الـ routes الثلاثة: `/api/products`، `/api/checkout`، `/api/admin`.
- يشغل السيرفر على `PORT` (افتراضي 5000).

---

## ملاحظات أمنية

- كلمات المرور مشفرة بـ bcrypt (12 rounds).
- JWT مخزن في HttpOnly Cookie (لا يمكن الوصول إليه من JavaScript).
- Cookie مضبوط على `secure: true` و `sameSite: none` في الإنتاج.
- Rate limiting على endpoint تسجيل الدخول (5 محاولات/15 دقيقة).
- قفل الحساب تلقائياً بعد 5 محاولات فاشلة.
- التحقق من نوع الحقول المسموح برفعها (whitelist) قبل أي عملية رفع.
