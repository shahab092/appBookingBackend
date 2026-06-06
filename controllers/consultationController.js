const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const Doctor = require("../models/Docters");
const Patient = require("../models/Patient");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { uploadToR2, generateSignedUrl, signFileUrls } = require("../utils/s3Storage");
const { emitConsultationInProgress } = require("../sockets/consultationSocketHandler");
const { sendConsultationFCM } = require("../utils/pushNotificationService");

const normalizeRole = (role) => String(role || "").toLowerCase();

const sameId = (left, right) =>
  left && right && left.toString() === right.toString();

const getDoctorProfileForUser = async (userId) => Doctor.findOne({ userId });

const addLog = (consultation, section, action, req, message) => {
  consultation.logs.push({
    section,
    action,
    performedByRole: normalizeRole(req.user.role),
    performedByUser: req.user._id,
    message,
    createdAt: new Date(),
  });
};

const ensureEditable = (consultation) => {
  if (consultation.status === "COMPLETED") {
    throw new ApiError(400, "Completed consultations cannot be edited");
  }

  if (consultation.status === "CANCELLED") {
    throw new ApiError(400, "Cancelled consultations cannot be edited");
  }
};

const ensureParticipant = async (consultation, user) => {
  const role = normalizeRole(user.role);

  if (role === "patient" && sameId(consultation.patientId, user._id)) {
    return;
  }

  if (role === "doctor") {
    const doctor = await getDoctorProfileForUser(user._id);
    if (doctor && sameId(consultation.doctorId, doctor._id)) {
      return;
    }
  }

  if (role === "admin") {
    return;
  }

  throw new ApiError(403, "You do not have access to this consultation");
};

const findConsultationForUser = async (consultationId, req) => {
  const consultation = await Consultation.findById(consultationId);
  if (!consultation) {
    throw new ApiError(404, "Consultation not found");
  }

  await ensureParticipant(consultation, req.user);
  return consultation;
};

const getPayloadFiles = (body) => {
  if (!body.resultFiles) return [];

  if (typeof body.resultFiles === "string") {
    try {
      return JSON.parse(body.resultFiles);
    } catch (error) {
      throw new ApiError(400, "resultFiles must be a valid JSON array");
    }
  }

  return Array.isArray(body.resultFiles) ? body.resultFiles : [];
};

const isValidResultFile = (file) => {
  if (!file?.buffer?.length) return false;

  const bytes = file.buffer;
  const mimeType = String(file.mimetype || "").toLowerCase();

  const isPdf =
    mimeType === "application/pdf" &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46;

  const isJpeg =
    ["image/jpeg", "image/jpg"].includes(mimeType) &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  const isPng =
    mimeType === "image/png" &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;

  const isWebp =
    mimeType === "image/webp" &&
    bytes.slice(0, 4).toString("ascii") === "RIFF" &&
    bytes.slice(8, 12).toString("ascii") === "WEBP";

  return isPdf || isJpeg || isPng || isWebp;
};

const uploadResultFiles = async (files = []) => {
  const uploadedFiles = [];

  for (const file of files) {
    if (!isValidResultFile(file)) {
      throw new ApiError(
        400,
        `Invalid report file: ${file.originalname}. Allowed files are valid PDF, JPEG, PNG, or WEBP.`,
      );
    }

    const fileUrl = await uploadToR2(file.buffer, file.originalname, file.mimetype);
    uploadedFiles.push({
      fileName: file.originalname,
      fileUrl,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    });
  }

  return uploadedFiles;
};

const serializeConsultation = async (consultation) =>
  Consultation.findById(consultation._id)
    .populate("appointmentId")
    .populate("patientId", "whatsappnumber role status")
    .populate("doctorId", "name email phone speciality image pmdcRegistrationNumber");

// @desc    Start consultation for an appointment
// @route   POST /api/consultations/start
// @access  Private (Doctor only)
const startConsultation = asyncHandler(async (req, res) => {
  const doctor = await getDoctorProfileForUser(req.user._id);
  if (!doctor) {
    throw new ApiError(404, "Doctor profile not found");
  }

  const appointment = await Appointment.findById(req.body.appointmentId);
  if (!appointment) {
    throw new ApiError(404, "Appointment not found");
  }

  if (!sameId(appointment.doctorId, doctor._id)) {
    throw new ApiError(403, "You can only start your own appointments");
  }

  if (!appointment.patientId) {
    throw new ApiError(
      400,
      "Consultation can only be started for a registered patient appointment",
    );
  }

  if (appointment.status === "cancelled") {
    throw new ApiError(400, "Cannot start consultation for a cancelled appointment");
  }

  const existing = await Consultation.findOne({
    appointmentId: appointment._id,
  });

  if (existing) {
    if (existing.status === "COMPLETED") {
      throw new ApiError(400, "Consultation is already completed");
    }

    if (existing.status === "CANCELLED") {
      throw new ApiError(400, "Cancelled consultation cannot be started");
    }

    if (existing.status !== "IN_PROGRESS") {
      existing.status = "IN_PROGRESS";
      existing.startedAt = existing.startedAt || new Date();
      addLog(
        existing,
        "consultation",
        "START",
        req,
        "Consultation started",
      );
    }

    existing.patientStatus = "WAITING_FOR_PATIENT";
    await existing.save();

    if (appointment.status !== "inprogress") {
      appointment.status = "inprogress";
      await appointment.save();
    }

    // Consultation already exists — re-notify the patient so they can join.
    // This handles the case where the doctor taps "Start" a second time
    // (e.g. no visible response on first tap) or the socket event was missed.
    const serialized = await serializeConsultation(existing);

    const io = req.app.get("io");
    if (io && existing.status === "IN_PROGRESS") {
      emitConsultationInProgress(io, existing.patientId, {
        consultationId: existing._id,
        appointmentId:  existing.appointmentId,
        doctorId:       existing.doctorId,
        status:         "IN_PROGRESS",
        patientStatus:  existing.patientStatus,
        startedAt:      existing.startedAt,
        doctor:         serialized?.doctorId,
        message:        "Your doctor has started the consultation. Please join now.",
      });
    }

    if (existing.status === "IN_PROGRESS") {
      sendConsultationFCM(existing.patientId, {
        consultationId: existing._id.toString(),
        appointmentId:  existing.appointmentId.toString(),
        doctorName:     serialized?.doctorId?.name || "Your Doctor",
      }).catch((err) => console.error("[FCM] Re-notify FCM error:", err));
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          serialized,
          "Consultation already exists",
        ),
      );
  }

  const consultation = new Consultation({
    appointmentId: appointment._id,
    patientId: appointment.patientId,
    doctorId: doctor._id,
    status: "IN_PROGRESS",
    patientStatus: "WAITING_FOR_PATIENT",
    startedAt: new Date(),
  });

  addLog(
    consultation,
    "consultation",
    "START",
    req,
    "Consultation started",
  );

  await consultation.save();
  await Appointment.findByIdAndUpdate(appointment._id, {
    status: "inprogress",
  });

  // ── Real-time: notify the patient that their consultation is IN_PROGRESS ──
  const io = req.app.get("io");
  if (io) {
    const serialized = await serializeConsultation(consultation);
    emitConsultationInProgress(io, consultation.patientId, {
      consultationId: consultation._id,
      appointmentId: consultation.appointmentId,
      doctorId: consultation.doctorId,
      status: "IN_PROGRESS",
      patientStatus: consultation.patientStatus,
      startedAt: consultation.startedAt,
      doctor: serialized.doctorId, // populated doctor info
      message: "Your doctor has started the consultation. Please join now.",
    });
  }

  // ── FCM: notify patient if app is background / killed (fire-and-forget) ──
  const serializedForFCM = await serializeConsultation(consultation);
  sendConsultationFCM(consultation.patientId, {
    consultationId: consultation._id.toString(),
    appointmentId:  consultation.appointmentId.toString(),
    doctorName:     serializedForFCM?.doctorId?.name || "Your Doctor",
  }).catch((err) => console.error("[FCM] Non-fatal consultation FCM error:", err));

  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        await serializeConsultation(consultation),
        "Consultation started successfully",
      ),
    );
});

// @desc    Get consultation details
// @route   GET /api/consultations/:id
// @access  Private (Doctor/Patient participant)
const getConsultationById = asyncHandler(async (req, res) => {
  const consultation = await findConsultationForUser(req.params.id, req);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await serializeConsultation(consultation),
        "Consultation fetched successfully",
      ),
    );
});

// @desc    Get consultation details by appointment ID
// @route   GET /api/consultations/appointment/:appointmentId
// @access  Private (Doctor/Patient participant)
const getConsultationByAppointmentId = asyncHandler(async (req, res) => {
  const consultation = await Consultation.findOne({
    appointmentId: req.params.appointmentId,
  });

  if (!consultation) {
    throw new ApiError(404, "Consultation not found for this appointment");
  }

  await ensureParticipant(consultation, req.user);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await serializeConsultation(consultation),
        "Consultation fetched successfully",
      ),
    );
});

// @desc    Add/update/delete symptoms
// @route   PATCH /api/consultations/:id/symptoms
// @access  Private (Doctor/Patient participant)
const updateSymptoms = asyncHandler(async (req, res) => {
  const consultation = await findConsultationForUser(req.params.id, req);
  ensureEditable(consultation);

  const action = req.body.action || "add";
  const now = new Date();

  if (action === "add") {
    consultation.symptoms.push({
      name: req.body.name,
      duration: req.body.duration,
      severity: req.body.severity,
      notes: req.body.notes,
      addedByRole: normalizeRole(req.user.role),
      addedByUser: req.user._id,
      addedAt: now,
    });
    addLog(consultation, "symptoms", "CREATE", req, `Added symptom: ${req.body.name}`);
  }

  if (action === "update") {
    const symptom = consultation.symptoms.id(req.body.symptomId);
    if (!symptom) throw new ApiError(404, "Symptom not found");

    ["name", "duration", "severity", "notes"].forEach((field) => {
      if (req.body[field] !== undefined) symptom[field] = req.body[field];
    });
    symptom.updatedByRole = normalizeRole(req.user.role);
    symptom.updatedByUser = req.user._id;
    symptom.updatedAt = now;
    addLog(consultation, "symptoms", "UPDATE", req, `Updated symptom: ${symptom.name}`);
  }

  if (action === "delete") {
    const symptom = consultation.symptoms.id(req.body.symptomId);
    if (!symptom) throw new ApiError(404, "Symptom not found");

    const symptomName = symptom.name;
    symptom.deleteOne();
    addLog(consultation, "symptoms", "DELETE", req, `Deleted symptom: ${symptomName}`);
  }

  await consultation.save();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        consultation.symptoms,
        "Symptoms updated successfully",
      ),
    );
});

// @desc    Add/update/delete investigations
// @route   PATCH /api/consultations/:id/investigations
// @access  Private (Doctor only)
const updateInvestigations = asyncHandler(async (req, res) => {
  const consultation = await findConsultationForUser(req.params.id, req);
  ensureEditable(consultation);

  const action = req.body.action || "add";

  if (action === "add") {
    consultation.investigations.push({
      testName: req.body.testName,
      testType: req.body.testType || "other",
      instructions: req.body.instructions,
      status: req.body.status || "ORDERED",
      orderedByRole: "doctor",
      orderedByUser: req.user._id,
      orderedAt: new Date(),
    });
    addLog(
      consultation,
      "investigations",
      "CREATE",
      req,
      `Ordered investigation: ${req.body.testName}`,
    );
  }

  if (action === "update") {
    const investigation = consultation.investigations.id(req.body.investigationId);
    if (!investigation) throw new ApiError(404, "Investigation not found");

    ["testName", "testType", "instructions", "status"].forEach((field) => {
      if (req.body[field] !== undefined) investigation[field] = req.body[field];
    });
    addLog(
      consultation,
      "investigations",
      "UPDATE",
      req,
      `Updated investigation: ${investigation.testName}`,
    );
  }

  if (action === "delete") {
    const investigation = consultation.investigations.id(req.body.investigationId);
    if (!investigation) throw new ApiError(404, "Investigation not found");

    const testName = investigation.testName;
    investigation.deleteOne();
    addLog(
      consultation,
      "investigations",
      "DELETE",
      req,
      `Deleted investigation: ${testName}`,
    );
  }

  await consultation.save();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        consultation.investigations,
        "Investigations updated successfully",
      ),
    );
});

// @desc    Upload or attach investigation results
// @route   PATCH /api/consultations/:id/investigations/:investigationId/result
// @access  Private (Patient only)
const uploadInvestigationResult = asyncHandler(async (req, res) => {
  const consultation = await findConsultationForUser(req.params.id, req);
  ensureEditable(consultation);

  const investigation = consultation.investigations.id(req.params.investigationId);
  if (!investigation) {
    throw new ApiError(404, "Investigation not found");
  }

  const uploadedFiles = await uploadResultFiles(req.files);
  const payloadFiles = getPayloadFiles(req.body).map((file) => ({
    fileName: file.fileName || file.name,
    fileUrl: file.fileUrl || file.url,
    mimeType: file.mimeType,
    size: file.size,
    uploadedAt: file.uploadedAt || new Date(),
  }));

  const resultFiles = [...uploadedFiles, ...payloadFiles].filter(
    (file) => file.fileUrl,
  );

  if (resultFiles.length) {
    investigation.resultFiles.push(...resultFiles);
  }

  if (req.body.resultNotes !== undefined) {
    investigation.resultNotes = req.body.resultNotes;
  }

  investigation.status = "RESULT_UPLOADED";
  investigation.uploadedByRole = normalizeRole(req.user.role);
  investigation.uploadedByUser = req.user._id;
  investigation.uploadedAt = new Date();

  addLog(
    consultation,
    "investigations",
    "UPDATE",
    req,
    `Uploaded result for investigation: ${investigation.testName}`,
  );

  await consultation.save();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        investigation,
        "Investigation result uploaded successfully",
      ),
    );
});

// @desc    Add/update/delete diagnoses
// @route   PATCH /api/consultations/:id/diagnoses
// @access  Private (Doctor only)
const updateDiagnoses = asyncHandler(async (req, res) => {
  const consultation = await findConsultationForUser(req.params.id, req);
  ensureEditable(consultation);

  const action = req.body.action || "add";

  if (action === "add") {
    consultation.diagnoses.push({
      diseaseName: req.body.diseaseName,
      diagnosisType: req.body.diagnosisType,
      notes: req.body.notes,
      addedByRole: "doctor",
      addedByUser: req.user._id,
      addedAt: new Date(),
    });
    addLog(
      consultation,
      "diagnoses",
      "CREATE",
      req,
      `Added ${req.body.diagnosisType} diagnosis: ${req.body.diseaseName}`,
    );
  }

  if (action === "update") {
    const diagnosis = consultation.diagnoses.id(req.body.diagnosisId);
    if (!diagnosis) throw new ApiError(404, "Diagnosis not found");

    ["diseaseName", "diagnosisType", "notes"].forEach((field) => {
      if (req.body[field] !== undefined) diagnosis[field] = req.body[field];
    });
    addLog(
      consultation,
      "diagnoses",
      "UPDATE",
      req,
      `Updated diagnosis: ${diagnosis.diseaseName}`,
    );
  }

  if (action === "delete") {
    const diagnosis = consultation.diagnoses.id(req.body.diagnosisId);
    if (!diagnosis) throw new ApiError(404, "Diagnosis not found");

    const diseaseName = diagnosis.diseaseName;
    diagnosis.deleteOne();
    addLog(
      consultation,
      "diagnoses",
      "DELETE",
      req,
      `Deleted diagnosis: ${diseaseName}`,
    );
  }

  await consultation.save();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        consultation.diagnoses,
        "Diagnoses updated successfully",
      ),
    );
});

// @desc    Add/update/delete medications
// @route   PATCH /api/consultations/:id/medications
// @access  Private (Doctor only)
const updateMedications = asyncHandler(async (req, res) => {
  const consultation = await findConsultationForUser(req.params.id, req);
  ensureEditable(consultation);

  const action = req.body.action || "add";

  if (action === "add") {
    consultation.medications.push({
      medicineName: req.body.medicineName,
      dose: req.body.dose,
      doseUnit: req.body.doseUnit,
      frequency: req.body.frequency,
      duration: req.body.duration,
      route: req.body.route,
      instructions: req.body.instructions,
      quantity: req.body.quantity,
      addedByRole: "doctor",
      addedByUser: req.user._id,
      addedAt: new Date(),
    });
    addLog(
      consultation,
      "medications",
      "CREATE",
      req,
      `Added medication: ${req.body.medicineName}`,
    );
  }

  if (action === "update") {
    const medication = consultation.medications.id(req.body.medicationId);
    if (!medication) throw new ApiError(404, "Medication not found");

    [
      "medicineName",
      "dose",
      "doseUnit",
      "frequency",
      "duration",
      "route",
      "instructions",
      "quantity",
    ].forEach((field) => {
      if (req.body[field] !== undefined) medication[field] = req.body[field];
    });
    addLog(
      consultation,
      "medications",
      "UPDATE",
      req,
      `Updated medication: ${medication.medicineName}`,
    );
  }

  if (action === "delete") {
    const medication = consultation.medications.id(req.body.medicationId);
    if (!medication) throw new ApiError(404, "Medication not found");

    const medicineName = medication.medicineName;
    medication.deleteOne();
    addLog(
      consultation,
      "medications",
      "DELETE",
      req,
      `Deleted medication: ${medicineName}`,
    );
  }

  await consultation.save();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        consultation.medications,
        "Medications updated successfully",
      ),
    );
});

// @desc    Add/update follow-up
// @route   PATCH /api/consultations/:id/follow-up
// @access  Private (Doctor only)
const updateFollowUp = asyncHandler(async (req, res) => {
  const consultation = await findConsultationForUser(req.params.id, req);
  ensureEditable(consultation);

  const isCreate = !consultation.followUp?.followUpDate;

  consultation.followUp = {
    followUpDate: req.body.followUpDate,
    reason: req.body.reason,
    instructions: req.body.instructions,
    addedByRole: consultation.followUp?.addedByRole || "doctor",
    addedByUser: consultation.followUp?.addedByUser || req.user._id,
    addedAt: consultation.followUp?.addedAt || new Date(),
    updatedAt: new Date(),
  };

  addLog(
    consultation,
    "followUp",
    isCreate ? "CREATE" : "UPDATE",
    req,
    isCreate ? "Added follow-up" : "Updated follow-up",
  );

  await consultation.save();

  res
    .status(200)
    .json(
      new ApiResponse(200, consultation.followUp, "Follow-up updated successfully"),
    );
});

// @desc    Add/update/delete notes
// @route   PATCH /api/consultations/:id/notes
// @access  Private (Doctor only)
const updateNotes = asyncHandler(async (req, res) => {
  const consultation = await findConsultationForUser(req.params.id, req);
  ensureEditable(consultation);

  const action = req.body.action || "add";

  if (action === "add") {
    consultation.notes.push({
      noteType: req.body.noteType,
      note: req.body.note,
      addedByRole: "doctor",
      addedByUser: req.user._id,
      addedAt: new Date(),
    });
    addLog(consultation, "notes", "CREATE", req, `Added note: ${req.body.noteType}`);
  }

  if (action === "update") {
    const note = consultation.notes.id(req.body.noteId);
    if (!note) throw new ApiError(404, "Note not found");

    ["noteType", "note"].forEach((field) => {
      if (req.body[field] !== undefined) note[field] = req.body[field];
    });
    addLog(consultation, "notes", "UPDATE", req, `Updated note: ${note.noteType}`);
  }

  if (action === "delete") {
    const note = consultation.notes.id(req.body.noteId);
    if (!note) throw new ApiError(404, "Note not found");

    const noteType = note.noteType;
    note.deleteOne();
    addLog(consultation, "notes", "DELETE", req, `Deleted note: ${noteType}`);
  }

  await consultation.save();

  res
    .status(200)
    .json(
      new ApiResponse(200, consultation.notes, "Notes updated successfully"),
    );
});

// @desc    Complete consultation
// @route   PATCH /api/consultations/:id/complete
// @access  Private (Doctor only)
const completeConsultation = asyncHandler(async (req, res) => {
  const consultation = await findConsultationForUser(req.params.id, req);

  if (consultation.status === "COMPLETED") {
    throw new ApiError(400, "Consultation is already completed");
  }

  if (consultation.status === "CANCELLED") {
    throw new ApiError(400, "Cancelled consultation cannot be completed");
  }

  consultation.status = "COMPLETED";
  consultation.completedAt = new Date();
  addLog(
    consultation,
    "consultation",
    "COMPLETE",
    req,
    "Consultation completed",
  );

  await consultation.save();
  await Appointment.findByIdAndUpdate(consultation.appointmentId, {
    status: "completed",
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await serializeConsultation(consultation),
        "Consultation completed successfully",
      ),
    );
});

// @desc    Get prescription/RX data
// @route   GET /api/consultations/:id/rx
// @access  Private (Doctor/Patient participant)
const getPrescription = asyncHandler(async (req, res) => {
  const consultation = await findConsultationForUser(req.params.id, req);

  const populated = await Consultation.findById(consultation._id)
    .populate("appointmentId")
    .populate("patientId", "whatsappnumber role status createdAt")
    .populate("doctorId", "name email phone speciality image pmdcRegistrationNumber");

  const patientProfile = await Patient.findOne({
    userId: populated.patientId._id,
  }).select("-password");

  const rx = {
    consultationId: populated._id,
    status: populated.status,
    patient: {
      user: populated.patientId,
      profile: patientProfile,
      name:
        patientProfile?.name ||
        populated.appointmentId?.patientName ||
        "Registered patient",
      phone:
        populated.patientId?.whatsappnumber ||
        populated.appointmentId?.patientPhone,
      email: populated.appointmentId?.patientEmail,
    },
    doctor: populated.doctorId,
    appointment: populated.appointmentId,
    symptoms: populated.symptoms,
    investigations: populated.investigations,
    diagnoses: populated.diagnoses,
    medications: populated.medications,
    followUp: populated.followUp,
    notes: populated.notes,
    createdAt: populated.createdAt,
    startedAt: populated.startedAt,
    completedAt: populated.completedAt,
  };

  res
    .status(200)
    .json(new ApiResponse(200, rx, "Prescription fetched successfully"));
});

// @desc    Get current patient's active (IN_PROGRESS) consultation
// @route   GET /api/consultations/active/me
// @access  Private (Patient only)
// Safety-check endpoint — called before entering ConsultationRoom.
// Never navigate a patient into the room based solely on FCM data;
// always verify here first because the doctor may have completed/cancelled.
const getActiveConsultation = asyncHandler(async (req, res) => {
  const consultation = await Consultation.findOne({
    patientId: req.user._id,
    status: "IN_PROGRESS",
  })
    .populate("appointmentId")
    .populate("patientId", "whatsappnumber role")
    .populate("doctorId", "name speciality image pmdcRegistrationNumber");

  if (!consultation) {
    throw new ApiError(404, "No active consultation found for this patient");
  }

  res
    .status(200)
    .json(new ApiResponse(200, consultation, "Active consultation fetched successfully"));
});

// @desc    Generate a temporary pre-signed URL for a specific investigation result file
// @route   GET /api/consultations/:id/investigations/:investigationId/files/:fileId/signed-url
// @access  Private (Patient / Doctor participant)
//
// The mobile app calls this endpoint when the user taps "View PDF".
// It returns a URL that is valid for 15 minutes and bypasses R2 public-bucket
// restrictions — no permanent public URL is ever sent to the client.
const getSignedFileUrl = asyncHandler(async (req, res) => {
  const consultation = await findConsultationForUser(req.params.id, req);

  const investigation = consultation.investigations.id(req.params.investigationId);
  if (!investigation) {
    throw new ApiError(404, "Investigation not found");
  }

  const file = investigation.resultFiles.id(req.params.fileId);
  if (!file) {
    throw new ApiError(404, "File not found");
  }

  if (!file.fileUrl) {
    throw new ApiError(400, "This file has no stored URL");
  }

  // 15-minute window — short enough to be secure, long enough to view the file
  const EXPIRES_IN = 15 * 60; // seconds
  const signedUrl = await generateSignedUrl(file.fileUrl, EXPIRES_IN);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        signedUrl,
        fileName: file.fileName,
        mimeType: file.mimeType,
        expiresInSeconds: EXPIRES_IN,
      },
      "Signed URL generated successfully",
    ),
  );
});

// @desc    Get list of all prescriptions for the current patient
// @route   GET /api/consultations/patient/prescriptions
// @access  Private (Patient only)
const getPatientPrescriptionsList = asyncHandler(async (req, res) => {
  const consultations = await Consultation.find({
    patientId: req.user._id,
    status: "COMPLETED",
  })
    .populate("doctorId", "name speciality")
    .sort({ completedAt: -1 });

  const prescriptionsList = consultations.map((consultation) => ({
    consultationId: consultation._id.toString(),
    rxId: `#RX-${consultation._id.toString().slice(-4).toUpperCase()}`,
    doctorName: consultation.doctorId?.name || "Unknown Doctor",
    speciality: consultation.doctorId?.speciality || "General",
    completedAt: consultation.completedAt,
    medicinesCount: consultation.medications?.length || 0,
    testsCount: consultation.investigations?.length || 0,
    status: consultation.status,
  }));

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        prescriptionsList,
        "Patient prescriptions fetched successfully",
      ),
    );
});

// @desc    Get list of all prescriptions created by the current doctor
// @route   GET /api/consultations/doctor/prescriptions
// @access  Private (Doctor only)
const getDoctorPrescriptionsList = asyncHandler(async (req, res) => {
  const doctor = await getDoctorProfileForUser(req.user._id);
  if (!doctor) {
    throw new ApiError(404, "Doctor profile not found");
  }

  const consultations = await Consultation.find({
    doctorId: doctor._id,
    status: "COMPLETED",
  })
    .populate("patientId", "whatsappnumber")
    .sort({ completedAt: -1 });

  const prescriptionsList = consultations.map((consultation) => ({
    consultationId: consultation._id.toString(),
    rxId: `#RX-${consultation._id.toString().slice(-4).toUpperCase()}`,
    patientPhone: consultation.patientId?.whatsappnumber || "N/A",
    completedAt: consultation.completedAt,
    medicinesCount: consultation.medications?.length || 0,
    testsCount: consultation.investigations?.length || 0,
    status: consultation.status,
  }));

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        prescriptionsList,
        "Doctor prescriptions fetched successfully",
      ),
    );
});

// @desc    Get full consultation details by ID
// @route   GET /api/consultations/details/:id
// @access  Private (Doctor/Patient participant)
const getFullConsultationDetails = asyncHandler(async (req, res) => {
  const consultation = await findConsultationForUser(req.params.id, req);

  const populated = await Consultation.findById(consultation._id)
    .populate("appointmentId")
    .populate("patientId", "whatsappnumber role status createdAt")
    .populate("doctorId", "name email phone speciality image pmdcRegistrationNumber");

  const patientProfile = await Patient.findOne({
    userId: populated.patientId._id,
  }).select("-password");

  const fullConsultation = {
    consultationId: populated._id,
    status: populated.status,
    patientStatus: populated.patientStatus,
    patient: {
      user: populated.patientId,
      profile: patientProfile,
      name:
        patientProfile?.name ||
        populated.appointmentId?.patientName ||
        "Registered patient",
      phone:
        populated.patientId?.whatsappnumber ||
        populated.appointmentId?.patientPhone,
      email: populated.appointmentId?.patientEmail,
    },
    doctor: populated.doctorId,
    appointment: populated.appointmentId,
    symptoms: populated.symptoms,
    investigations: populated.investigations,
    diagnoses: populated.diagnoses,
    medications: populated.medications,
    followUp: populated.followUp,
    notes: populated.notes,
    logs: populated.logs,
    createdAt: populated.createdAt,
    updatedAt: populated.updatedAt,
    startedAt: populated.startedAt,
    completedAt: populated.completedAt,
  };

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        fullConsultation,
        "Full consultation details fetched successfully",
      ),
    );
});

module.exports = {
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
  getPatientPrescriptionsList,
  getDoctorPrescriptionsList,
  getFullConsultationDetails,
};
