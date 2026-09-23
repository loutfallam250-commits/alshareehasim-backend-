const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,   // fail fast if Atlas unreachable
      socketTimeoutMS: 45000,           // close sockets after 45s inactivity
      maxPoolSize: 10,                  // max concurrent connections (default: 5)
      minPoolSize: 2,                   // keep 2 connections warm
      heartbeatFrequencyMS: 10000,      // heartbeat every 10s
    });
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
