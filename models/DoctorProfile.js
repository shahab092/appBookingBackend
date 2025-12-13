const mongoose = require("mongoose");

const doctorProfileSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        specialization: {
            type: String,
            required: true,
        },

        department: {
            type: String,
            required: true,
        },

        pmdcNumber: {
            type: String,
            required: true,
            unique: true,
        },

        phone: {
            type: String,
            required: true,
        },

        address: {
            type: String,
            required: true,
        },

        experience: {
            type: Number,
            required: true,
        },

        about: {
            type: String,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("DoctorProfile", doctorProfileSchema);
