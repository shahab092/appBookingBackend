const express = require("express");
const router = express.Router();
const {
  bookAppointment,
  getMyAppointments,
  updateAppointmentStatus
} = require("../controllers/appointmentController");
const verifyJWT = require("../middleware/auth");
const verifyOptionalJWT = require("../middleware/optionalAuth");

// POST /api/appointments - Book a new appointment (Public/Optional Login)
router.post("/", verifyOptionalJWT, bookAppointment);

// All following routes require strict authentication
router.use(verifyJWT);

// GET /api/appointments/my - Get user's appointments
router.get("/my", getMyAppointments);

// PATCH /api/appointments/:id/status - Update appointment status
router.patch("/:id/status", updateAppointmentStatus);

module.exports = router;
