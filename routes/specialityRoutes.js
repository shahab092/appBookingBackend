const express = require("express");
const router = express.Router();
const {
    seedSpecialities,
    getSpecialities,
} = require("../controllers/specialityController");

// Public endpoints (or protect as needed)
router.post("/seed", seedSpecialities);
router.get("/", getSpecialities);

module.exports = router;
