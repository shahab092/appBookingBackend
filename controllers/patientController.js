const Patient = require("../models/Patient");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { uploadToR2, deleteFromR2 } = require("../utils/s3Storage");

// @desc    Get current patient profile
// @route   GET /api/patient/profile
// @access  Private (Patient only)
const getPatientProfile = asyncHandler(async (req, res) => {
    const patient = await Patient.findOne({ userId: req.user._id });

    if (!patient) {
        throw new ApiError(404, "Patient profile not found");
    }

    res.status(200).json(
        new ApiResponse(200, patient, "Patient profile fetched successfully")
    );
});

// @desc    Update patient profile
// @route   PUT /api/patient/profile
// @access  Private (Patient only)
const updatePatientProfile = asyncHandler(async (req, res) => {
    const {
        name,
        gender,
        dateOfBirth,
        address,
        job,
        income,
        bloodGroup,
        profilePicture,
        preferredLanguage,
        emergencyContact,
        medicalHistory,
        vitals,
        allergies,
        insuranceDetails
    } = req.body;

    const patient = await Patient.findOne({ userId: req.user._id });

    if (!patient) {
        throw new ApiError(404, "Patient profile not found");
    }

    // Update basic fields
    if (name) patient.name = name;
    if (gender) patient.gender = gender;
    if (dateOfBirth) patient.dateOfBirth = dateOfBirth;
    if (address) patient.address = address;
    if (job) patient.job = job;
    if (income) patient.income = income;
    if (bloodGroup) patient.bloodGroup = bloodGroup;
    if (profilePicture) patient.profilePicture = profilePicture;
    if (preferredLanguage) patient.preferredLanguage = preferredLanguage;

    // Update nested objects safely
    if (emergencyContact) {
        patient.emergencyContact = { ...patient.emergencyContact, ...emergencyContact };
    }

    if (medicalHistory) {
        patient.medicalHistory = { ...patient.medicalHistory, ...medicalHistory };
    }

    if (insuranceDetails) {
        patient.insuranceDetails = { ...patient.insuranceDetails, ...insuranceDetails };
    }

    // Add vitals (treat as history/push)
    if (vitals) {
        patient.vitals.push({
            ...vitals,
            recordedBy: req.user._id,
            date: new Date() // Explicitly set current time
        });
    }

    // Update allergies (replace or append based on preference, here we replace for simplicity or use a toggle logic if needed)
    if (allergies) {
        patient.allergies = allergies;
    }

    await patient.save();

    res.status(200).json(
        new ApiResponse(200, patient, "Patient profile updated successfully")
    );
});

// @desc    Upload patient profile image to Cloudflare R2
// @route   POST /api/patient/upload-image
// @access  Private (Patient only)
const uploadPatientImage = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ApiError(400, "No image file provided");
    }

    const patient = await Patient.findOne({ userId: req.user._id });

    if (!patient) {
        throw new ApiError(404, "Patient profile not found");
    }

    // Cleanup: Delete old profile image if it exists
    if (patient.profilePicture && !patient.profilePicture.includes("flaticon.com")) {
        console.log("Cleanup: Deleting old patient image...");
        await deleteFromR2(patient.profilePicture);
    }

    // Upload new image to R2
    const imageUrl = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);

    // Update patient profile with new URL
    patient.profilePicture = imageUrl;
    await patient.save();

    res.status(200).json(
        new ApiResponse(200, { imageUrl }, "Patient image uploaded successfully")
    );
});

module.exports = {
    getPatientProfile,
    updatePatientProfile,
    uploadPatientImage
};
