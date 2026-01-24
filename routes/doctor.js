const express = require('express');
const router = express.Router();
const {
    registerDoctor,
    updateStatus,
    confirmDoctor,
    getDoctors,
    updateDoctorProfile,
    getAvailableSlots,
    addLeave,
    removeLeave,
    suggestSpeciality
} = require('../controllers/docterController');
const { authenticate, authorize } = require('../middleware/auth');

// POST /api/doctors - Create a new doctor
router.post('/register', registerDoctor);

// PUT /api/doctors/update-profile - Update doctor profile
router.put('/update-profile', authenticate, updateDoctorProfile);

// GET /api/doctors/available-slots - Get available slots for a doctor/date
router.get('/available-slots', getAvailableSlots);

// GET /api/doctors - Get all doctors
router.get('/', getDoctors);

// PATCH /api/doctors/:id/status - Update doctor status
router.patch('/:id/status', updateStatus);

// GET /api/doctors/confirm - Confirm doctor registration via email token
router.get('/confirm', confirmDoctor);

// Leaves management
router.post('/add-leave', authenticate, addLeave);
router.post('/remove-leave', authenticate, removeLeave);

// Speciality Suggestion
router.post('/suggest-speciality', authenticate, suggestSpeciality);

module.exports = router;
