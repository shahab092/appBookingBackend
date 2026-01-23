const Speciality = require("../models/Speciality");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

// ================= SEED SPECIALITIES =================
// This will replace all existing specialities with the new ones provided in the request body
const seedSpecialities = asyncHandler(async (req, res) => {
    const specialitiesData = req.body;

    if (!Array.isArray(specialitiesData) || specialitiesData.length === 0) {
        throw new ApiError(400, "Please provide an array of specialities");
    }

    // Clear existing items and insert new ones
    await Speciality.deleteMany({});
    const createdSpecialities = await Speciality.insertMany(specialitiesData);

    res
        .status(200)
        .json(new ApiResponse(200, createdSpecialities, "Specialities seeded successfully"));
});

// ================= GET ALL SPECIALITIES =================
const getSpecialities = asyncHandler(async (req, res) => {
    const specialities = await Speciality.find({}).sort({ speciality: 1 });

    res
        .status(200)
        .json(new ApiResponse(200, specialities, "Specialities fetched successfully"));
});

module.exports = {
    seedSpecialities,
    getSpecialities,
};
