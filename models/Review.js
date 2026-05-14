const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
        required: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        required: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Calculate average rating when a review is saved
reviewSchema.post('save', async function () {
    const Doctor = mongoose.model('Doctor');
    const reviews = await this.constructor.find({ doctorId: this.doctorId });

    const numReviews = reviews.length;
    const averageRating = reviews.reduce((acc, item) => item.rating + acc, 0) / numReviews;

    await Doctor.findByIdAndUpdate(this.doctorId, {
        averageRating: averageRating.toFixed(1),
        numReviews: numReviews
    });
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
