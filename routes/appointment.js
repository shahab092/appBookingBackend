const express = require("express");
const router = express.Router();
const {
  bookAppointment,
  getPatientAppointments,
  getDoctorAppointments,
  updateAppointmentStatus
} = require("../controllers/appointmentController");

// POST /api/appointments/book
router.post("/book", bookAppointment);

// GET /api/appointments/patient/:patientId
router.get("/patient/:patientId", getPatientAppointments);

// GET /api/appointments/doctor/:doctorId
router.get("/doctor/:doctorId", getDoctorAppointments);

router.patch("/:appointmentId/status", updateAppointmentStatus);


module.exports = router;
