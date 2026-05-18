const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    appointmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: true,
        unique: true
    },
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
    ratings: {
        overall: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        waitTime: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        bedsideManner: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        clinicEnvironment: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        }
    },
    comment: {
        type: String,
        required: false
    },
    doctorReply: {
        text: { type: String },
        repliedAt: { type: Date }
    },
    helpfulVotes: {
        type: Number,
        default: 0
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
    const averageRating = reviews.reduce((acc, item) => item.ratings.overall + acc, 0) / numReviews;

    await Doctor.findByIdAndUpdate(this.doctorId, {
        averageRating: averageRating.toFixed(1),
        numReviews: numReviews
    });
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
