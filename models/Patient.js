const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true
        },
        whatsappnumber: {
            type: String,
            required: true,
            trim: true
        },
        password: {
            type: String,
            required: true
        },
        // We can add more patient-specific fields here later
        name: {
            type: String,
            trim: true
        },
        gender: {
            type: String,
            enum: ["male", "female", "other"],
        },
        dateOfBirth: {
            type: Date
        }
    },
    {
        timestamps: true,
    }
);

const Patient = mongoose.models.Patient || mongoose.model("Patient", patientSchema);

module.exports = Patient;
