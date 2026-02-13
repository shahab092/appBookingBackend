const express = require("express");
const router = express.Router();
const { getPatientProfile, updatePatientProfile, uploadPatientImage } = require("../controllers/patientController");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const multer = require("multer");

// Multer configuration (matching doctor setup)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Invalid file type. Only JPEG, PNG, and WEBP are allowed."), false);
        }
    },
});

// Middleware to verify JWT (simplified version based on authRoutes.js)
const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        try {
            token = req.headers.authorization.split(" ")[1];
            const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select("-password");
            next();
        } catch (error) {
            res.status(401).json({ message: "Not authorized" });
        }
    }
    if (!token) {
        res.status(401).json({ message: "Not authorized, no token" });
    }
};

const isPatient = (req, res, next) => {
    if (req.user && req.user.role === "patient") {
        next();
    } else {
        res.status(403).json({ message: "Access denied. Patients only." });
    }
};

// Routes
router.get("/profile", protect, isPatient, getPatientProfile);
router.put("/profile", protect, isPatient, updatePatientProfile);

// Image Upload Route
router.post("/upload-image", protect, isPatient, (req, res, next) => {
    upload.single("image")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ success: false, error: err.message });
        } else if (err) {
            return res.status(400).json({ success: false, error: err.message });
        }
        next();
    });
}, uploadPatientImage);

module.exports = router;
