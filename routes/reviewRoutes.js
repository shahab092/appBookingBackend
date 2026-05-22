const express = require('express');
const router = express.Router();
const { createReview, getDoctorReviews, replyToReview, upvoteReview } = require('../controllers/reviewController');
const authenticate = require('../middleware/auth');

router.post('/', authenticate, createReview);
router.get('/:doctorId', getDoctorReviews);
router.post('/:reviewId/reply', authenticate, replyToReview); // Assuming doctors authenticate
router.put('/:reviewId/upvote', authenticate, upvoteReview); // Authenticate so only logged-in users upvote

module.exports = router;
