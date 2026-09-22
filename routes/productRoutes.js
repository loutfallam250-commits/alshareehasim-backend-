const express = require("express");
const router = express.Router();
const { getProducts, getProduct, getFeaturedProducts, getProductsByIds, createProduct, updateProduct, deleteProduct } = require("../controllers/productController");

router.route("/").get(getProducts).post(createProduct);
router.get("/featured", getFeaturedProducts);
router.get("/by-ids", getProductsByIds);
router.route("/:id").get(getProduct).put(updateProduct).delete(deleteProduct);

module.exports = router;
