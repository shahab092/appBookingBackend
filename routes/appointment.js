const express = require("express");
const router = express.Router();
const {
  bookAppointment,
  getMyAppointments,
  getPatientAppointments,
  getLoggedInDoctorAppointments,
  updateAppointmentStatus,
  getDoctorAppointments
} = require("../controllers/appointmentController");
const verifyJWT = require("../middleware/auth");
const verifyOptionalJWT = require("../middleware/optionalAuth");

// POST /api/appointments - Book a new appointment (Public/Optional Login)
router.post("/", verifyOptionalJWT, bookAppointment);

// All following routes require strict authentication
router.use(verifyJWT);

// GET /api/appointments/my - Get user's appointments
router.get("/my", getMyAppointments);

// GET /api/appointments/patient - Get logged-in patient's appointments
router.get("/patient", getPatientAppointments);

// GET /api/appointments/doctor - Get logged-in doctor's appointments
router.get("/doctor", getLoggedInDoctorAppointments);

// PATCH /api/appointments/:id/status - Update appointment status
router.patch("/:id/status", updateAppointmentStatus);

// GET /api/appointments/doctor/:doctorId - Get all appointments for a specific doctor
router.get("/doctor/:doctorId", getDoctorAppointments);

module.exports = router;
