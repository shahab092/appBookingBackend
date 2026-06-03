const express = require("express");
const multer = require("multer");
const {
  startConsultation,
  getConsultationById,
  getConsultationByAppointmentId,
  getActiveConsultation,
  updateSymptoms,
  updateInvestigations,
  uploadInvestigationResult,
  updateDiagnoses,
  updateMedications,
  updateFollowUp,
  updateNotes,
  completeConsultation,
  getPrescription,
  getSignedFileUrl,
} = require("../controllers/consultationController");
const verifyJWT = require("../middleware/auth");
const authorizeRoles = require("../middleware/authorizeRoles");
const {
  validateParamsObjectIds,
  validateStartConsultation,
  validateSymptoms,
  validateInvestigation,
  validateInvestigationResult,
  validateDiagnosis,
  validateMedication,
  validateFollowUp,
  validateNote,
} = require("../middleware/consultationValidation");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/jpg",
      "application/pdf",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Allowed: JPEG, PNG, WEBP, PDF."), false);
    }
  },
});

const handleResultUpload = (req, res, next) => {
  upload.array("resultFiles", 5)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    next();
  });
};

router.use(verifyJWT);

router.post(
  "/start",
  authorizeRoles("doctor"),
  validateStartConsultation,
  startConsultation,
);

// IMPORTANT: /active/me must be registered BEFORE /:id to avoid
// Express treating "active" as a consultation ObjectId and returning 500.
router.get("/active/me", getActiveConsultation);

router.get(
  "/appointment/:appointmentId",
  validateParamsObjectIds("appointmentId"),
  getConsultationByAppointmentId,
);

router.get("/:id", validateParamsObjectIds("id"), getConsultationById);

router.patch(
  "/:id/symptoms",
  authorizeRoles("patient", "doctor"),
  validateParamsObjectIds("id"),
  validateSymptoms,
  updateSymptoms,
);

router.patch(
  "/:id/investigations",
  authorizeRoles("doctor"),
  validateParamsObjectIds("id"),
  validateInvestigation,
  updateInvestigations,
);

router.patch(
  "/:id/investigations/:investigationId/result",
  authorizeRoles("patient"),
  validateParamsObjectIds("id", "investigationId"),
  handleResultUpload,
  validateInvestigationResult,
  uploadInvestigationResult,
);

router.patch(
  "/:id/diagnoses",
  authorizeRoles("doctor"),
  validateParamsObjectIds("id"),
  validateDiagnosis,
  updateDiagnoses,
);

router.patch(
  "/:id/medications",
  authorizeRoles("doctor"),
  validateParamsObjectIds("id"),
  validateMedication,
  updateMedications,
);

router.patch(
  "/:id/follow-up",
  authorizeRoles("doctor"),
  validateParamsObjectIds("id"),
  validateFollowUp,
  updateFollowUp,
);

router.patch(
  "/:id/notes",
  authorizeRoles("doctor"),
  validateParamsObjectIds("id"),
  validateNote,
  updateNotes,
);

router.patch(
  "/:id/complete",
  authorizeRoles("doctor"),
  validateParamsObjectIds("id"),
  completeConsultation,
);

router.get("/:id/rx", validateParamsObjectIds("id"), getPrescription);

// Generate a temporary (15-min) pre-signed URL for a specific result file.
// Mobile app calls this when the user taps "View PDF" / "View Image".
// DO NOT expose the raw fileUrl to the client — always use this endpoint instead.
router.get(
  "/:id/investigations/:investigationId/files/:fileId/signed-url",
  validateParamsObjectIds("id", "investigationId", "fileId"),
  getSignedFileUrl,
);

module.exports = router;
