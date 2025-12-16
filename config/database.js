// const mongoose = require('mongoose');

// const connectDB = async () => {
//   try {
//     const conn = await mongoose.connect(process.env.MONGODB_URI);
//     console.log(`MongoDB Connected: ${conn.connection.host}`);
//   } catch (error) {
//     console.error('Database connection error:', error);
//     process.exit(1);
//   }
// };

// module.exports = connectDB;




const mongoose = require("mongoose");

const dataBase = async () => {
  try {
    mongoose.set("strictQuery", true);
    mongoose.set("bufferCommands", false); // This disables buffering

    await mongoose.connect(process.env.MONGODB_URI); // ✅ This line must be awaited!

    mongoose.connection.on("connected", () => {
      console.log("✅ MongoDB connected successfully");
    });

    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ MongoDB disconnected");
    });

  } catch (error) {
    console.error("❌ Initial DB connection error:", error);
    throw error; // ⛔ Important! Rethrow so server doesn't start
  }
};
// testing
module.exports = dataBase;
