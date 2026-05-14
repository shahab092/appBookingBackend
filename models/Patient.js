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
        },
        address: {
            type: String,
            trim: true
        },
        job: {
            type: String,
            trim: true
        },
        income: {
            type: String,
            trim: true
        },
        bloodGroup: {
            type: String,
            enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"],
            default: "unknown"
        },
        profilePicture: {
            type: String,
            default: "https://cdn-icons-png.flaticon.com/512/149/149071.png"
        },
        preferredLanguage: {
            type: String,
            default: "Urdu/English"
        },
        emergencyContact: {
            name: String,
            relationship: String,
            phone: String
        },
        medicalHistory: {
            background: String,
            history: String,
            chronicMedications: [String],
            socialHistory: String
        },
        vitals: [
            {
                weight: {
                    type: Number,
                    min: [0, "Weight cannot be negative"],
                    max: [500, "Weight exceeds realistic limit (500kg)"]
                },
                height: {
                    type: Number,
                    min: [0, "Height cannot be negative"],
                    max: [300, "Height exceeds realistic limit (300cm)"]
                },
                bloodPressure: String,
                bloodSugar: String,
                temperature: {
                    type: Number,
                    min: [90, "Temperature too low (below 90°F)"],
                    max: [110, "Temperature too high (above 110°F)"]
                },
                pulse: {
                    type: Number,
                    min: [30, "Pulse rate too low (below 30 bpm)"],
                    max: [220, "Pulse rate too high (above 220 bpm)"]
                },
                date: {
                    type: Date,
                    default: Date.now
                },
                recordedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User"
                }
            }
        ],
        allergies: [
            {
                name: String,
                category: {
                    type: String,
                    enum: ["food", "environment", "medicine", "other"],
                    default: "other"
                }
            }
        ],
        insuranceDetails: {
            provider: String,
            policyId: String
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

patientSchema.virtual("age").get(function () {
    if (!this.dateOfBirth) return null;
    const diff = Date.now() - this.dateOfBirth.getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
});

const Patient = mongoose.models.Patient || mongoose.model("Patient", patientSchema);

module.exports = Patient;
