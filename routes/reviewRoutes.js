const express = require('express');
const router = express.Router();
const { createReview, getDoctorReviews } = require('../controllers/reviewController');
const authenticate = require('../middleware/auth');

router.post('/', authenticate, createReview);
router.get('/:doctorId', getDoctorReviews);

module.exports = router;
