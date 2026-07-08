const express = require('express');
const router = express.Router();
const { createReview, getDoctorReviews, replyToReview } = require('../controllers/reviewController');
const authenticate = require('../middleware/auth');

router.post('/', authenticate, createReview);
router.get('/:doctorId', getDoctorReviews);
router.post('/:reviewId/reply', authenticate, replyToReview); // Assuming doctors authenticate
// Voting is intentionally disabled until duplicate-vote protection is implemented.
// router.put('/:reviewId/upvote', authenticate, upvoteReview);

module.exports = router;
