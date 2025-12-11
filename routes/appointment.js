// routes/appointment.js
const express = require('express');
const {
  createAppointment,
  getAllAppointments,
  getAppointment,
  updateAppointment,
  deleteAppointment,
} = require('../controllers/appointmentController');

const router = express.Router();

// ===========================
// Appointment Routes
// ===========================

// POST /api/appointments
router.post('/', createAppointment);

// GET /api/appointments
router.get('/', getAllAppointments);

// GET /api/appointments/:id
router.get('/:id', getAppointment);

// PUT /api/appointments/:id
router.put('/:id', updateAppointment);

// DELETE /api/appointments/:id
router.delete('/:id', deleteAppointment);

module.exports = router;
