const mongoose = require("mongoose");

const superSpecialitySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    services: {
        type: [String],
        default: [],
    },
});

const specialitySchema = new mongoose.Schema(
    {
        speciality: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        super_specialities: {
            type: [superSpecialitySchema],
            default: [],
        },
    },
    {
        timestamps: true,
    }
);

const Speciality = mongoose.models.Speciality || mongoose.model("Speciality", specialitySchema);

module.exports = Speciality;
