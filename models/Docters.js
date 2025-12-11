const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    specialization: {
        type: String,
        required: false // changed to optional
    },
    department: {
        type: String,
        required: false // new department field
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
    registrationDate: {
        type: Date,
        default: Date.now
    },
    isAvailable: {
        type: Boolean,
        default: true // new field for availability
    },
    address: {
        type: String,
        required: false // new optional field
    },
    pmdcRegistrationNumber: {
        type: String,
        required: true // new required field
    },
    status: {
        type: String,
        enum: ['pending', 'inprogress', 'approved', 'away', 'in clinic'], // added inprogress
        default: 'pending' // default value
    },
    deleted: {
        type: Boolean,
        default: false // soft delete field
    },
    confirmationToken: {
        type: String,
        required: false
    },
    tokenExpiresAt: {
        type: Date,
        required: false
    },
    isConfirmed: {
        type: Boolean,
        default: false
    }
});

const Doctor = mongoose.model('Doctor', doctorSchema);

module.exports = Doctor;