const express = require('express');
const router = express.Router();
const { registerDoctor, updateStatus, confirmDoctor, getDoctors } = require('../controllers/docterController');
const { authenticate, authorize } = require('../middleware/auth');

// POST /api/doctors - Create a new doctor
router.post('/register', registerDoctor);

// GET /api/doctors - Get all doctors
router.get('/', getDoctors);

// // PATCH /api/doctors/:id/status - Update doctor status
router.patch('/:id/status', updateStatus);

// // GET /api/doctors/confirm - Confirm doctor registration via email token
// router.get('/confirm', confirmDoctor);

module.exports = router;
