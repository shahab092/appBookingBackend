const express = require("express");
const router = express.Router();
const {
    seedSpecialities,
    getSpecialities,
    getSpecialitySuggestions,
    approveSpecialitySuggestion,
    getSpecialityById,
} = require("../controllers/specialityController");

// Public endpoints (or protect as needed)
router.post("/seed", seedSpecialities);
router.get("/seed", (req, res) => res.status(405).json({ message: "Use POST method for seeding data" }));
router.get("/", getSpecialities);
router.get("/:id", getSpecialityById);
// Speciality Suggestions (Admin)
router.get("/suggestions", getSpecialitySuggestions);
router.patch("/suggestions/:id", approveSpecialitySuggestion);

module.exports = router;
