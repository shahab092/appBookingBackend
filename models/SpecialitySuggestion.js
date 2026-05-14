const mongoose = require('mongoose');

const specialitySuggestionSchema = new mongoose.Schema({
    suggestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const SpecialitySuggestion = mongoose.model('SpecialitySuggestion', specialitySuggestionSchema);

module.exports = SpecialitySuggestion;
