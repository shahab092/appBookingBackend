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

    // Transform the response to use cleaner field names
    const transformedSpecialities = specialities.map(spec => {
        const specObj = spec.toObject();

        return {
            _id: specObj._id,
            speciality: specObj.speciality,
            super_specialities: specObj.super_specialities?.map(ss => ({
                _id: ss._id,
                name: ss.name,
                services: ss.services
            })) || [],
            createdAt: specObj.createdAt,
            updatedAt: specObj.updatedAt
        };
    });

    res
        .status(200)
        .json(new ApiResponse(200, transformedSpecialities, "Specialities fetched successfully"));
});

const SpecialitySuggestion = require("../models/SpecialitySuggestion");

// ... existing code ...

const getSpecialitySuggestions = asyncHandler(async (req, res) => {
    const suggestions = await SpecialitySuggestion.find({}).populate('suggestedBy', 'name');
    res.status(200).json(new ApiResponse(200, suggestions, "Suggestions fetched"));
});
const getSpecialityById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const speciality = await Speciality.findById(id);

    if (!speciality) {
        throw new ApiError(404, "Speciality not found");
    }

    res.status(200).json(new ApiResponse(200, speciality, "Speciality fetched successfully"));
});

const approveSpecialitySuggestion = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'
    const suggestion = await SpecialitySuggestion.findById(id);
    if (!suggestion) throw new ApiError(404, "Suggestion not found");
    suggestion.status = status;
    await suggestion.save();
    if (status === 'approved') {
        // Automatically create the speciality if it doesn't exist
        const existing = await Speciality.findOne({ speciality: suggestion.name });
        if (!existing) {
            await Speciality.create({ speciality: suggestion.name });
        }
    }

    res.status(200).json(new ApiResponse(200, suggestion, `Suggestion ${status}`));
});

module.exports = {
    seedSpecialities,
    getSpecialities,
    getSpecialitySuggestions,
    approveSpecialitySuggestion,
    getSpecialityById,
};
