
const express = require("express");
const {
    registerDoctor,
    loginDoctor,
    getAllDoctors,
    getDoctorById,
    updateDoctorProfile,
    approveDoctor,
    deleteDoctor,
} = require("../controllers/doctorProfileController.js");


const router = express.Router();

// -------------------------------
// Public Routes
// -------------------------------
router.post("/register", registerDoctor);
router.post("/login", loginDoctor);


router.get("/", getAllDoctors);


router.get("/:doctorId", getDoctorById);

router.put("/:doctorId", updateDoctorProfile);


router.patch("/:doctorId/approve", approveDoctor);


router.delete("/:doctorId", deleteDoctor);

module.exports = router;
