const express = require("express");
const router = express.Router();
const { adminAuth } = require("../middleware/auth");
const {
  getProducts,
  getProduct,
  getFeaturedProducts,
  getProductsByIds,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

// Public reads
router.get("/", getProducts);
router.get("/featured", getFeaturedProducts);
router.get("/by-ids", getProductsByIds);
router.get("/:id", getProduct);

// Admin-only writes
router.post("/", adminAuth, createProduct);
router.put("/:id", adminAuth, updateProduct);
router.delete("/:id", adminAuth, deleteProduct);

module.exports = router;
