const express = require("express");
const router = express.Router();
const {
  updateStatus,
  approveDoctor,
  getDoctors,
  getDoctorById,
  searchDoctors,
  getCities,
  updateDoctorProfile,
  getAvailableSlots,
  getDoctorAvailabilityConfig,
  addLeave,
  removeLeave,
  suggestSpeciality,
  createDoctorByAdmin,
  bulkCreateDoctors,
  getPendingCount,
} = require("../controllers/docterController");
const authenticate = require("../middleware/auth");
const isAdmin = require("../middleware/isAdmin");

// POST /api/doctor/create-by-admin - Create doctor account and profile (Admin only)
router.post("/create-by-admin", authenticate, isAdmin, createDoctorByAdmin);

// POST /api/doctor/bulk-create - Bulk create doctors (Admin only)
router.post("/bulk-create", authenticate, isAdmin, bulkCreateDoctors);

// PUT /api/doctors/update-profile - Update doctor profile
router.put("/update-profile", authenticate, updateDoctorProfile);

// GET /api/doctors/available-slots - Get available slots for a doctor/date
router.get("/available-slots", getAvailableSlots);

// GET /api/doctors/:id/availability - Get doctor's weekly availability config
router.get("/:id/availability", getDoctorAvailabilityConfig);

// GET /api/doctor/cities - Get unique cities for lookup
router.get("/cities", getCities);

// GET /api/doctor/pending-count - Get count of doctors awaiting approval
router.get("/pending-count", authenticate, isAdmin, getPendingCount);

// GET /api/doctor/search - Search doctors by name and/or speciality
router.get("/search", searchDoctors);

// GET /api/doctors/:id - Get single doctor by ID
router.get("/:id", getDoctorById);

// GET /api/doctors - Get all doctors
router.get("/", getDoctors);

// PATCH /api/doctors/:id/approve - Approve doctor (Admin only, no body required)
router.patch("/:id/approve", authenticate, isAdmin, approveDoctor);

// PATCH /api/doctors/:id/status - Update doctor status (Admin only)
router.patch("/:id/status", authenticate, isAdmin, updateStatus);

// Leaves management
router.post("/add-leave", authenticate, addLeave);
router.post("/remove-leave", authenticate, removeLeave);

// Speciality Suggestion
router.post("/suggest-speciality", authenticate, suggestSpeciality);

module.exports = router;
