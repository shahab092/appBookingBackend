const mongoose = require("mongoose");

const actorSchema = {
  addedByRole: {
    type: String,
    enum: ["patient", "doctor", "admin"],
  },
  addedByUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  addedAt: Date,
  updatedByRole: {
    type: String,
    enum: ["patient", "doctor", "admin"],
  },
  updatedByUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  updatedAt: Date,
};

const symptomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    duration: {
      type: String,
      trim: true,
    },
    severity: {
      type: String,
      enum: ["mild", "moderate", "severe", "MILD", "MODERATE", "SEVERE"],
    },
    notes: {
      type: String,
      trim: true,
    },
    ...actorSchema,
  },
  { _id: true },
);

const resultFileSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      trim: true,
    },
    fileUrl: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      trim: true,
    },
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const investigationSchema = new mongoose.Schema(
  {
    testName: {
      type: String,
      required: true,
      trim: true,
    },
    testType: {
      type: String,
      enum: ["blood_test", "ultrasound", "xray", "mri", "ct_scan", "urine_test", "other"],
      default: "other",
    },
    instructions: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["ORDERED", "SAMPLE_COLLECTED", "RESULT_UPLOADED", "REVIEWED", "CANCELLED"],
      default: "ORDERED",
    },
    orderedByRole: {
      type: String,
      enum: ["doctor"],
      required: true,
    },
    orderedByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderedAt: {
      type: Date,
      default: Date.now,
    },
    resultFiles: [resultFileSchema],
    resultNotes: {
      type: String,
      trim: true,
    },
    uploadedByRole: {
      type: String,
      enum: ["patient", "doctor"],
    },
    uploadedByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    uploadedAt: Date,
    isNormal: {
      type: Boolean,
      default: true,
    },
    doctorReviewNotes: {
      type: String,
      trim: true,
    },
    reviewedByRole: {
      type: String,
      enum: ["doctor"],
    },
    reviewedByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: Date,
  },
  { _id: true },
);

const diagnosisSchema = new mongoose.Schema(
  {
    diseaseName: {
      type: String,
      required: true,
      trim: true,
    },
    diagnosisType: {
      type: String,
      enum: ["differential", "final"],
      required: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    addedByRole: {
      type: String,
      enum: ["doctor"],
      required: true,
    },
    addedByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const medicationSchema = new mongoose.Schema(
  {
    medicineName: {
      type: String,
      required: true,
      trim: true,
    },
    dose: {
      type: String,
      required: true,
      trim: true,
    },
    doseUnit: {
      type: String,
      trim: true,
    },
    frequency: {
      type: String,
      required: true,
      trim: true,
    },
    duration: {
      type: String,
      required: true,
      trim: true,
    },
    route: {
      type: String,
      trim: true,
    },
    instructions: {
      type: String,
      trim: true,
    },
    quantity: {
      type: Number,
      min: 0,
    },
    addedByRole: {
      type: String,
      enum: ["doctor"],
      required: true,
    },
    addedByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const noteSchema = new mongoose.Schema(
  {
    noteType: {
      type: String,
      required: true,
      trim: true,
    },
    note: {
      type: String,
      required: true,
      trim: true,
    },
    isNormal: {
      type: Boolean,
      default: true,
    },
    doctorNotes: {
      type: String,
      trim: true,
    },
    addedByRole: {
      type: String,
      enum: ["doctor"],
      required: true,
    },
    addedByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const logSchema = new mongoose.Schema(
  {
    section: {
      type: String,
      required: true,
      trim: true,
    },
    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE", "START", "COMPLETE", "CANCEL"],
      required: true,
    },
    performedByRole: {
      type: String,
      enum: ["patient", "doctor", "admin"],
      required: true,
    },
    performedByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const consultationSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
      unique: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "NOT_STARTED",
      index: true,
    },
    patientStatus: {
      type: String,
      enum: ["WAITING_FOR_PATIENT", "PATIENT_JOINED", "PATIENT_REJECTED"],
      default: "WAITING_FOR_PATIENT",
      index: true,
    },
    symptoms: [symptomSchema],
    investigations: [investigationSchema],
    diagnoses: [diagnosisSchema],
    medications: [medicationSchema],
    followUp: {
      followUpDate: Date,
      reason: {
        type: String,
        trim: true,
      },
      instructions: {
        type: String,
        trim: true,
      },
      addedByRole: {
        type: String,
        enum: ["doctor"],
      },
      addedByUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      addedAt: Date,
      updatedAt: Date,
    },
    notes: [noteSchema],
    logs: [logSchema],
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true },
);

consultationSchema.index({ doctorId: 1, patientId: 1, createdAt: -1 });

module.exports =
  mongoose.models.Consultation ||
  mongoose.model("Consultation", consultationSchema);
