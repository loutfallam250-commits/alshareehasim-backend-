require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");
const { initSentry, Sentry } = require("./config/sentry");

// Initialize Sentry first
initSentry();

connectDB();

const app = express();

// Sentry request handler must be first
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

const allowedOrigins = [
  "http://localhost:3000",
  ...(process.env.FRONTEND_URL || "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean),
];

app.set("trust proxy", 1);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

// CSRF Protection Middleware
app.use((req, res, next) => {
  // Skip CSRF for GET, HEAD, OPTIONS
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  
  // Check Origin header
  const origin = req.get("origin");
  const referer = req.get("referer");
  
  // Allow internal server-to-server requests
  const internalSecret = req.get("x-internal-secret");
  if (internalSecret && internalSecret === process.env.INTERNAL_SECRET) {
    return next();
  }

  if (!origin && !referer) {
    return res.status(403).json({ ok: false, error: "CSRF: Missing origin/referer" });
  }
  
  const requestOrigin = origin || (referer ? new URL(referer).origin : null);
  if (requestOrigin && !allowedOrigins.includes(requestOrigin)) {
    return res.status(403).json({ ok: false, error: "CSRF: Invalid origin" });
  }
  
  next();
});
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict"
}));

app.get("/", (req, res) => {
  res.json({ message: "API is running..." });
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Import routes
const productRoutes = require("./routes/productRoutes");
const checkoutRoutes = require("./routes/checkoutRoutes");
const adminRoutes = require("./routes/adminRoutes");
const shippingRoutes = require("./routes/shippingRoutes");
const customerRoutes = require("./routes/customerRoutes");
app.use("/api/products", productRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/customers", customerRoutes);

// Sentry error handler must be before other error middleware
app.use(Sentry.Handlers.errorHandler());

// Global error handler
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(500).json({ 
    ok: false, 
    error: process.env.NODE_ENV === "production" 
      ? "حدث خطأ في الخادم" 
      : err.message 
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
