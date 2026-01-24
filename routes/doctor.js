const express = require('express');
const router = express.Router();
const {
    updateStatus,
    getDoctors,
    updateDoctorProfile,
    getAvailableSlots,
    addLeave,
    removeLeave,
    suggestSpeciality
} = require('../controllers/docterController');
const authenticate = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');



// PUT /api/doctors/update-profile - Update doctor profile
router.put('/update-profile', authenticate, updateDoctorProfile);

// GET /api/doctors/available-slots - Get available slots for a doctor/date
router.get('/available-slots', getAvailableSlots);

// GET /api/doctors - Get all doctors
router.get('/', getDoctors);

// PATCH /api/doctors/:id/status - Update doctor status (Admin only)
router.patch('/:id/status', authenticate, isAdmin, updateStatus);



// Leaves management
router.post('/add-leave', authenticate, addLeave);
router.post('/remove-leave', authenticate, removeLeave);

// Speciality Suggestion
router.post('/suggest-speciality', authenticate, suggestSpeciality);

module.exports = router;
