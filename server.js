const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");

// Routes & middleware
const connectDB = require("./config/database");
const doctorRoute = require("./routes/doctor.js");
const appointmentRoute = require("./routes/appointment.js");
const consultationRoute = require("./routes/consultation.js");
const notificationRoute = require("./routes/notificationRoutes.js");
const errorHandler = require("./middleware/error.middleware.js");
const rateLimit = require("express-rate-limit");
const { initSockets } = require("./sockets");

dotenv.config();

// Initialize app
const app = express();
const PORT = process.env.PORT || 5000;

// Rate limiter
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const parseCookies = (req, res, next) => {
  const cookieHeader = req.headers.cookie;

  req.cookies = {};

  if (!cookieHeader) {
    return next();
  }

  cookieHeader.split(";").forEach((cookie) => {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex === -1) return;

    const key = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();

    try {
      req.cookies[key] = decodeURIComponent(value);
    } catch {
      req.cookies[key] = value;
    }
  });

  next();
};

// Middleware
app.use(parseCookies);
app.use(express.json({ limit: '10mb' })); // parse JSON
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Routes
app.use("/api/auth", authLimiter, require("./routes/users.js"));
app.use("/api/doctor", doctorRoute);
app.use("/api/appointments", appointmentRoute);
app.use("/api/consultations", consultationRoute);
app.use("/api/notifications", notificationRoute);
app.use("/api/patient", require("./routes/patientRoutes"));
app.use("/api/specialities", require("./routes/specialityRoutes.js"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/chat", require("./routes/chat.js"));

// Test route
app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

// Create HTTP server for Socket.IO
const server = http.createServer(app);

// Attach Socket.IO
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

// Initialize all sockets
initSockets(io);
app.set("io", io);

// Error handler (last middleware)
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    await connectDB(); // connect to DB
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
  }
};

startServer();
