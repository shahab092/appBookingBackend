const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/database");
const doctorRoute = require("./routes/doctor.js");
const appointmentRoute = require("./routes/appointment.js");
const notificationRoute = require("./routes/notificationRoutes.js");
const errorHandler = require("./middleware/error.middleware.js");
const rateLimit = require("express-rate-limit");

//  Socket initializer
const { initSockets } = require("./sockets"); // 👈 ADD THIS

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

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://mern-stack-auth-drab.vercel.app",
      "https://hostpital-managment.vercel.app",
    ],
    credentials: true,
  })
);

app.use(express.json());

// Routes
app.use("/api/auth", authLimiter, require("./routes/users.js"));
app.use("/api/doctor", doctorRoute);
app.use("/api/appointments", appointmentRoute);
app.use("/api/notifications", notificationRoute);

app.get("/", (req, res) => {
  res.send("API is running1 🚀");
});

// ❗ Create HTTP server (REQUIRED for socket.io)
const server = http.createServer(app);

// ❗ Attach Socket.IO
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://mern-stack-auth-drab.vercel.app",
    ],
    credentials: true,
  },
});

// Initialize all sockets
initSockets(io);
app.set("io", io);
// Start server
const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
  }
};

startServer();

// Error handler (LAST middleware)
app.use(errorHandler);
