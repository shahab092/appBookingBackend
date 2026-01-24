const express = require('express');
const router = express.Router();
const {
    updateStatus,
    getDoctors,
    getDoctorById,
    searchDoctors,
    getCities,
    updateDoctorProfile,
    getAvailableSlots,
    addLeave,
    removeLeave,
    suggestSpeciality,
    createDoctorByAdmin,
    bulkCreateDoctors
} = require('../controllers/docterController');
const authenticate = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');



// POST /api/doctor/create-by-admin - Create doctor account and profile (Admin only)
router.post('/create-by-admin', authenticate, isAdmin, createDoctorByAdmin);

// POST /api/doctor/bulk-create - Bulk create doctors (Admin only)
router.post('/bulk-create', authenticate, isAdmin, bulkCreateDoctors);

// PUT /api/doctors/update-profile - Update doctor profile
router.put('/update-profile', authenticate, updateDoctorProfile);

// GET /api/doctors/available-slots - Get available slots for a doctor/date
router.get('/available-slots', getAvailableSlots);

// GET /api/doctor/cities - Get unique cities for lookup
router.get('/cities', getCities);

// GET /api/doctor/search - Search doctors by name and/or speciality
router.get('/search', searchDoctors);

// GET /api/doctors/:id - Get single doctor by ID
router.get('/:id', getDoctorById);

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
