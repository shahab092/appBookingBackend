const mongoose = require("mongoose");
const ApiError = require("../utils/ApiError");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const requireFields = (body, fields) => {
  const missing = fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || value === "";
  });

  if (missing.length) {
    throw new ApiError(400, `Missing required field(s): ${missing.join(", ")}`);
  }
};

const validateParamsObjectIds =
  (...paramNames) =>
  (req, res, next) => {
    for (const paramName of paramNames) {
      if (!isValidObjectId(req.params[paramName])) {
        throw new ApiError(400, `Invalid ${paramName}`);
      }
    }

    next();
  };

const validateStartConsultation = (req, res, next) => {
  requireFields(req.body, ["appointmentId"]);

  if (!isValidObjectId(req.body.appointmentId)) {
    throw new ApiError(400, "Invalid appointmentId");
  }

  next();
};

const validateSymptoms = (req, res, next) => {
  const action = req.body.action || "add";
  const allowedActions = ["add", "update", "delete"];

  if (!allowedActions.includes(action)) {
    throw new ApiError(400, "Invalid action. Allowed values: add, update, delete");
  }

  if (["update", "delete"].includes(action)) {
    requireFields(req.body, ["symptomId"]);
    if (!isValidObjectId(req.body.symptomId)) {
      throw new ApiError(400, "Invalid symptomId");
    }
  }

  if (action === "add") {
    requireFields(req.body, ["name"]);
  }

  next();
};

const validateInvestigation = (req, res, next) => {
  const action = req.body.action || "add";
  const allowedActions = ["add", "update", "delete"];

  if (!allowedActions.includes(action)) {
    throw new ApiError(400, "Invalid action. Allowed values: add, update, delete");
  }

  if (["update", "delete"].includes(action)) {
    requireFields(req.body, ["investigationId"]);
    if (!isValidObjectId(req.body.investigationId)) {
      throw new ApiError(400, "Invalid investigationId");
    }
  }

  if (action === "add") {
    requireFields(req.body, ["testName"]);
  }

  next();
};

const validateInvestigationResult = (req, res, next) => {
  const hasFiles = Array.isArray(req.files) && req.files.length > 0;
  const hasJsonFiles =
    Array.isArray(req.body.resultFiles) && req.body.resultFiles.length > 0;

  if (!hasFiles && !hasJsonFiles && !req.body.resultNotes) {
    throw new ApiError(
      400,
      "Provide resultFiles, uploaded files, or resultNotes",
    );
  }

  next();
};

const validateDiagnosis = (req, res, next) => {
  const action = req.body.action || "add";
  const allowedActions = ["add", "update", "delete"];

  if (!allowedActions.includes(action)) {
    throw new ApiError(400, "Invalid action. Allowed values: add, update, delete");
  }

  if (["update", "delete"].includes(action)) {
    requireFields(req.body, ["diagnosisId"]);
    if (!isValidObjectId(req.body.diagnosisId)) {
      throw new ApiError(400, "Invalid diagnosisId");
    }
  }

  if (action === "add") {
    requireFields(req.body, ["diseaseName", "diagnosisType"]);
  }

  next();
};

const validateMedication = (req, res, next) => {
  const action = req.body.action || "add";
  const allowedActions = ["add", "update", "delete"];

  if (!allowedActions.includes(action)) {
    throw new ApiError(400, "Invalid action. Allowed values: add, update, delete");
  }

  if (["update", "delete"].includes(action)) {
    requireFields(req.body, ["medicationId"]);
    if (!isValidObjectId(req.body.medicationId)) {
      throw new ApiError(400, "Invalid medicationId");
    }
  }

  if (action === "add") {
    requireFields(req.body, ["medicineName", "dose", "frequency", "duration"]);
  }

  next();
};

const validateFollowUp = (req, res, next) => {
  requireFields(req.body, ["followUpDate"]);

  if (Number.isNaN(new Date(req.body.followUpDate).getTime())) {
    throw new ApiError(400, "Invalid followUpDate");
  }

  next();
};

const validateNote = (req, res, next) => {
  const action = req.body.action || "add";
  const allowedActions = ["add", "update", "delete"];

  if (!allowedActions.includes(action)) {
    throw new ApiError(400, "Invalid action. Allowed values: add, update, delete");
  }

  if (["update", "delete"].includes(action)) {
    requireFields(req.body, ["noteId"]);
    if (!isValidObjectId(req.body.noteId)) {
      throw new ApiError(400, "Invalid noteId");
    }
  }

  if (action === "add") {
    requireFields(req.body, ["noteType", "note"]);

    if (req.body.isNormal === false && !String(req.body.doctorNotes || "").trim()) {
      throw new ApiError(400, "doctorNotes is required when isNormal is false");
    }
  }

  if (action === "update") {
    if (req.body.isNormal === false && !String(req.body.doctorNotes ?? "").trim()) {
      throw new ApiError(400, "doctorNotes is required when isNormal is false");
    }
  }

  next();
};

module.exports = {
  validateParamsObjectIds,
  validateStartConsultation,
  validateSymptoms,
  validateInvestigation,
  validateInvestigationResult,
  validateDiagnosis,
  validateMedication,
  validateFollowUp,
  validateNote,
};
