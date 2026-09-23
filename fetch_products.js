const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://bsjd648hdj_db_user:3axQmuieLGFhhi9B@cluster0.egubejh.mongodb.net/lamsa-new-sim?appName=Cluster0';

async function main() {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.");
    
    // Just get any products collection directly
    const db = mongoose.connection.db;
    const products = await db.collection('products').find().limit(5).toArray();
    
    console.log("Products from DB:", JSON.stringify(products, null, 2));
    
    // Also log all unique keys across the products to see the schema
    const keys = new Set();
    products.forEach(p => Object.keys(p).forEach(k => keys.add(k)));
    console.log("Keys found in products:", Array.from(keys));
    
    await mongoose.disconnect();
}

main().catch(console.error);
