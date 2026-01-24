const Review = require('../models/Review');
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const createReview = asyncHandler(async (req, res) => {
    const { doctorId, rating, comment } = req.body;
    const patientId = req.user._id;

    if (!doctorId || !rating) {
        throw new ApiError(400, "Doctor ID and rating are required");
    }

    // Check if patient already reviewed this doctor
    const existingReview = await Review.findOne({ doctorId, patientId });
    if (existingReview) {
        throw new ApiError(400, "You have already reviewed this doctor");
    }

    const review = await Review.create({
        doctorId,
        patientId,
        rating,
        comment
    });

    res.status(201).json(
        new ApiResponse(201, review, "Review submitted successfully")
    );
});

const getDoctorReviews = asyncHandler(async (req, res) => {
    const { doctorId } = req.params;
    const reviews = await Review.find({ doctorId }).populate('patientId', 'name image');

    res.status(200).json(
        new ApiResponse(200, reviews, "Reviews fetched successfully")
    );
});

module.exports = {
    createReview,
    getDoctorReviews
};
