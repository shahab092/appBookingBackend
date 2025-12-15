const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/error.middleware.js');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/authRoutes.js');
const doctorRoute = require('./routes/doctorProfile.js');

const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors({
  origin: ["http://localhost:5173", "https://mern-stack-auth-drab.vercel.app"],
  credentials: true,
}));
app.use(express.json());

// Routes
app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/doctor", require('./routes/doctor.js'));

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Patient Authentication API',
    version: '1.0.0',
    availableRoutes: ['POST /api/auth/google-login', 'GET /api/auth/profile', 'PUT /api/auth/profile']
  });
});
app.use(errorHandler);
const PORT = process.env.PORT || 7000 ;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Google OAuth for Patients Only`);
});