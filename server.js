const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const doctorRoute = require('./routes/doctor.js');
const errorHandler = require('./middleware/error.middleware.js');
const rateLimit = require('express-rate-limit');

// Rate limiter
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Initialize app
const app = express();
connectDB();

// Middleware
app.use(cors({
  origin: ["http://localhost:5173", "https://mern-stack-auth-drab.vercel.app"],
  credentials: true,
}));
app.use(express.json());
app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/doctor", doctorRoute);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Patient Authentication API',
    version: '1.0.0',
    availableRoutes: [
      'POST /api/v1/auth/google-login',
      'GET /api/v1/auth/profile',
      'PUT /api/v1/auth/profile'
    ]
  });
});

// Error handling middleware
app.use(errorHandler);

// **Export as serverless function**

