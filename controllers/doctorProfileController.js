// const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const bcrypt = require('bcrypt');
const { isValidObjectId } = require("mongoose");

const asyncHandler = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { ApiResponse } = require("../utils/ApiResponse");

const User = require("../models/User");
const DoctorProfile = require("../models/DoctorProfile");

const registerDoctor = asyncHandler(async (req, res) => {
    const {
        name,
        email,
        password,
        specialization,
        department,
        pmdcNumber,
        phone,
        address,
        experience,
        about,
    } = req.body;


    if (!name || !email || !password || !pmdcNumber || !specialization) {
        throw new ApiError(400, "All required fields must be filled");
    }


    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw new ApiError(400, "Email already registered");
    }


    const hashedPassword = await bcrypt.hash(password, 10);


    const newUser = await User.create({
        name,
        email,
        password: hashedPassword,
        role: "doctor",
        provider: "local",
        status: "pending",
    });


    const doctorProfile = await DoctorProfile.create({
        user: newUser._id,
        specialization,
        department,
        pmdcNumber,
        phone,
        address,
        experience,
        about,
    });

    newUser.doctorProfile = doctorProfile._id;
    await newUser.save();


    return res.status(201).json(
        new ApiResponse(
            201,
            { userId: newUser._id },
            "Doctor registration successful. Await admin approval."
        )
    );
});
const getDoctorById = asyncHandler(async (req, res) => {
    const { doctorId } = req.params;

    if (!isValidObjectId(doctorId)) {
        throw new ApiError(400, 'invalid doctorId')

    }

    const doctor = await User.findById(doctorId)
        .populate("doctorProfile")
        .select("-password");

    if (!doctor || doctor.role !== "doctor") {
        throw new ApiError(404, "Doctor not found");
    }

    return res.status(200).json(
        new ApiResponse(200, doctor, "Doctor details fetched successfully")
    );
});

const loginDoctor = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required");
    }


    const doctor = await User.findOne({ email, role: "doctor" });
    if (!doctor) {
        throw new ApiError(404, "Doctor not found");
    }


    if (doctor.status !== "active") {
        throw new ApiError(403, "Doctor account is not active. Awaiting approval or rejected.");
    }


    const isPasswordValid = await bcrypt.compare(password, doctor.password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials");
    }


    const token = jwt.sign(
        { id: doctor._id, role: doctor.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );


    return res.status(200).json(
        new ApiResponse(200, { token, doctorId: doctor._id }, "Login successful")
    );
});

const getAllDoctors = asyncHandler(async (req, res) => {
    const doctors = await User.find({ role: "doctor" })
        .populate("doctorProfile")
        .select("-password");

    return res.status(200).json(
        new ApiResponse(200, doctors, "List of all doctors")
    );
});
const updateDoctorProfile = asyncHandler(async (req, res) => {
    const { doctorId } = req.params;
    const {
        name,
        specialization,
        department,
        phone,
        address,
        experience,
        about,
    } = req.body;

    if (!isValidObjectId(doctorId)) {
        throw new ApiError(400, 'invalid doctorId')
    }
    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== "doctor") {
        throw new ApiError(404, "Doctor not found");
    }


    if (name) doctor.name = name;


    const profile = await DoctorProfile.findById(doctor.doctorProfile);
    if (!profile) throw new ApiError(404, "Doctor profile not found");

    if (specialization) profile.specialization = specialization;
    if (department) profile.department = department;
    if (phone) profile.phone = phone;
    if (address) profile.address = address;
    if (experience) profile.experience = experience;
    if (about) profile.about = about;

    await profile.save();
    await doctor.save();

    return res.status(200).json(
        new ApiResponse(200, { doctorId: doctor._id }, "Doctor profile updated successfully")
    );
});


const approveDoctor = asyncHandler(async (req, res) => {
    const { doctorId } = req.params;
    const { status } = req.body;


    if (!isValidObjectId(doctorId)) {
        throw new ApiError(400, "Invalid doctorId");
    }


    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== "doctor") {
        throw new ApiError(404, "Doctor not found");
    }



    const allowedStatuses = ["pending", "active", "rejected"];
    if (!allowedStatuses.includes(status)) {
        throw new ApiError(400, `Invalid status. Allowed: ${allowedStatuses.join(", ")}`);
    }


    doctor.status = status;
    await doctor.save();


    return res.status(200).json(
        new ApiResponse(
            200,
            { doctorId: doctor._id, status },
            `Doctor status updated to "${status}"`
        )
    );
});



const deleteDoctor = asyncHandler(async (req, res) => {
    const { doctorId } = req.params;

    if (!isValidObjectId(doctorId)) {
        throw new ApiError(400, 'invalid doctorId')
    }
    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== "doctor") {
        throw new ApiError(404, "Doctor not found");
    }


    doctor.status = "deleted";
    await doctor.save();

    return res.status(200).json(
        new ApiResponse(200, { doctorId }, "Doctor deleted successfully")
    );
});




module.exports = {
    registerDoctor,
    loginDoctor,

    deleteDoctor, approveDoctor, getAllDoctors, getDoctorById, updateDoctorProfile
};
