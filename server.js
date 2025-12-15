const express = require('express');
const cors = require('cors');
const dotenv = require("dotenv");
const connectDB = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const doctorRoute = require('./routes/doctor.js');
const errorHandler = require('./middleware/error.middleware.js');
const rateLimit = require('express-rate-limit');
// const cookieParser = require("cookie-parser"); 

// Rate limiter
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Initialize app
const app = express();
dotenv.config();
connectDB();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: ["http://localhost:5173", "https://mern-stack-auth-drab.vercel.app"],
  credentials: true,
}));
// app.use(cookieParser());
app.use(express.json());
app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/doctor", doctorRoute);


app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

const startServer = async () => {
  try {
    await dataBaseconnect();
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
  }
};

startServer();
app.use(errorHandler);


