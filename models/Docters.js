const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    speciality: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Speciality',
        required: false
    },
    superSpeciality: {
        type: String,
        required: false
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    phone: {
        type: String,
        required: true
    },
    address: {
        street: { type: String, required: false },
        city: { type: String, required: false }
    },
    consultationTime: {
        type: Number,
        default: 15, // Default 15 minutes
    },
    locations: [
        {
            name: { type: String, required: true },
            phone: { type: String, required: false }, // Hospital/Clinic number
            coordinates: {
                lat: { type: Number, required: true },
                lng: { type: Number, required: true }
            }
        }
    ],
    availability: [
        {
            day: {
                type: String,
                enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                required: true
            },
            startTime: { type: String, required: true }, // HH:mm
            endTime: { type: String, required: true },   // HH:mm
            locationId: { type: mongoose.Schema.Types.ObjectId }, // References a location in the locations array
            appointmentType: {
                type: String,
                enum: ['online', 'inclinic'],
                default: 'inclinic'
            }
        }
    ],
    registrationDate: {
        type: Date,
        default: Date.now
    },
    education: [
        {
            degree: { type: String, required: true },
            institute: { type: String, required: true },
            startYear: { type: String, required: true },
            endYear: { type: String, required: true }
        }
    ],
    isAvailable: {
        type: Boolean,
        default: true
    },
    pmdcRegistrationNumber: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'inprogress', 'approved', 'away', 'in clinic', 'incomplete'],
        default: 'pending'
    },
    deleted: {
        type: Boolean,
        default: false
    },
    image: {
        type: String, // URL to the image
        required: false
    },
    experience: {
        type: Number, // Years of experience
        default: 0
    },
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    numReviews: {
        type: Number,
        default: 0
    },
    leaves: [
        {
            type: Date // Dates when the doctor is not available
        }
    ],
    completenessScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    about: {
        type: String,
        required: false
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other'],
        required: false
    },
    languages: {
        type: [String],
        default: []
    },
    awards: [
        {
            name: { type: String },
            year: { type: String }
        }
    ],
    memberships: {
        type: [String],
        default: []
    },
    fees: {
        online: { type: Number, default: 0 },
        inclinic: { type: Number, default: 0 }
    }
});

const Doctor = mongoose.model('Doctor', doctorSchema);

module.exports = Doctor;