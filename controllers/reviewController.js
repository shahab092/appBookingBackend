const Review = require('../models/Review');
const Appointment = require('../models/Appointment');
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const createReview = asyncHandler(async (req, res) => {
    const { doctorId, appointmentId, ratings, comment } = req.body;
    const patientId = req.user._id;

    if (!doctorId || !appointmentId || !ratings || !ratings.overall) {
        throw new ApiError(400, "Doctor ID, Appointment ID, and ratings are required");
    }

    // Verify appointment belongs to patient and is completed
    const appointment = await Appointment.findOne({ _id: appointmentId, patientId, doctorId });
    if (!appointment) {
        throw new ApiError(404, "Appointment not found for this doctor and patient");
    }
    if (appointment.status !== 'completed') {
        throw new ApiError(400, "You can only review completed appointments");
    }

    // Check if patient already reviewed this appointment
    const existingReview = await Review.findOne({ appointmentId });
    if (existingReview) {
        throw new ApiError(400, "You have already reviewed this appointment");
    }

    const review = await Review.create({
        appointmentId,
        doctorId,
        patientId,
        ratings,
        comment
    });

    res.status(201).json(
        new ApiResponse(201, review, "Review submitted successfully")
    );
});

const getDoctorReviews = asyncHandler(async (req, res) => {
    const { doctorId } = req.params;
    const reviews = await Review.find({ doctorId })
        .populate('patientId', 'name image')
        .sort({ createdAt: -1 });

    res.status(200).json(
        new ApiResponse(200, reviews, "Reviews fetched successfully")
    );
});

const replyToReview = asyncHandler(async (req, res) => {
    const { reviewId } = req.params;
    const { text } = req.body;
    
    // In a real app, verify that req.user is the doctor who owns the review
    // For now, assuming auth middleware handles it or we trust the logged-in doctor
    
    if (!text) {
        throw new ApiError(400, "Reply text is required");
    }

    const review = await Review.findById(reviewId);
    if (!review) {
        throw new ApiError(404, "Review not found");
    }

    review.doctorReply = {
        text,
        repliedAt: Date.now()
    };
    
    await review.save();

    res.status(200).json(
        new ApiResponse(200, review, "Reply added successfully")
    );
});

const upvoteReview = asyncHandler(async (req, res) => {
    const { reviewId } = req.params;
    
    const review = await Review.findByIdAndUpdate(
        reviewId,
        { $inc: { helpfulVotes: 1 } },
        { new: true }
    );

    if (!review) {
        throw new ApiError(404, "Review not found");
    }

    res.status(200).json(
        new ApiResponse(200, review, "Review upvoted successfully")
    );
});

module.exports = {
    createReview,
    getDoctorReviews,
    replyToReview,
    upvoteReview
};
