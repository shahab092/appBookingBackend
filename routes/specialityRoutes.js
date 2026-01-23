const express = require("express");
const router = express.Router();
const {
    seedSpecialities,
    getSpecialities,
} = require("../controllers/specialityController");

// Public endpoints (or protect as needed)
router.post("/seed", seedSpecialities);
router.get("/seed", (req, res) => res.status(405).json({ message: "Use POST method for seeding data" }));
router.get("/", getSpecialities);

module.exports = router;
