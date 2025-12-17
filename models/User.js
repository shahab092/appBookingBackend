const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      select: false,
    },

    googleId: {
      type: String,
      default: null,
      index: true,
    },

    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },

    refreshToken: {
      type: String,
      select: false,
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    verificationToken: {
      type: String,
      select: false,
    },

    // ================= DOCTOR CONFIRMATION FIELDS =================
    doctorConfirmationToken: {
      type: String,
      select: false,  // Don't return in queries by default
    },

    doctorTokenExpiresAt: {
      type: Date,
      select: false,
    },

    doctorConfirmedAt: {
      type: Date,
    },

    isDoctorConfirmed: {
      type: Boolean,
      default: false,
    },
    // =============================================================

    firstName: {
      type: String,
      required: true,
      trim: true,
      default: "Google",
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
      default: "User",
    },

    phoneNumber: {
      type: String,
      trim: true,
    },

    profilePicture: {
      type: String,
      default: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
    },

    dateOfBirth: {
      type: Date,
    },

    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },

    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
    },

    role: {
      type: String,
      enum: [
        "patient",
        "doctor",
        "admin",
        "super_admin",
        "xray",
        "lab",
        "pharmacy",
      ],
      default: "patient",
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "active", "rejected","inprogress", "suspended", "inactive","approved"],
      default: "active",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // ================= DOCTOR PROFILE =================
    doctorProfile: {
      specialization: String,
      qualifications: [String],
      licenseNumber: String,
      yearsOfExperience: Number,
      consultationFee: Number,

      availableSlots: [
        {
          dayOfWeek: Number,
          startTime: String,
          endTime: String,
          isActive: Boolean,
        },
      ],

      avgRating: {
        type: Number,
        default: 0,
      },

      totalRatings: {
        type: Number,
        default: 0,
      },

      isVerified: {
        type: Boolean,
        default: false,
      },

      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },

      verifiedAt: Date,

      documents: [
        {
          name: String,
          url: String,
          type: {
            type: String,
            enum: ["license", "degree", "id_proof", "certification"],
          },
          uploadedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],

      bio: String,
      hospitalAffiliations: [String],
      awards: [String],
      languagesSpoken: [String],
    },

    // ================= PATIENT PROFILE =================
    patientProfile: {
      bloodGroup: {
        type: String,
        enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"],
      },
      allergies: [String],
      chronicConditions: [String],

      emergencyContact: {
        name: String,
        relationship: String,
        phoneNumber: String,
      },

      insuranceInfo: {
        provider: String,
        policyNumber: String,
        validUntil: Date,
      },

      height: Number,
      weight: Number,

      bloodPressure: {
        systolic: Number,
        diastolic: Number,
      },

      bloodSugarLevel: Number,
    },

    medicalHistory: [
      {
        condition: String,
        diagnosedDate: Date,
        status: {
          type: String,
          enum: ["active", "resolved", "chronic"],
        },
        notes: String,
      },
    ],

    // ================= LAB PROFILE =================
    labProfile: {
      department: String,
      licenseNumber: String,
      isAuthorized: {
        type: Boolean,
        default: false,
      },
      authorizedTests: [String],
    },

    // ================= PHARMACY PROFILE =================
    pharmacyProfile: {
      licenseNumber: String,
      isAuthorized: {
        type: Boolean,
        default: false,
      },
      specialization: String,
    },

    // ================= XRAY PROFILE =================
    xrayProfile: {
      licenseNumber: String,
      isAuthorized: {
        type: Boolean,
        default: false,
      },
      equipmentTypes: [String],
    },

    lastLogin: Date,

    loginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },

    lockUntil: {
      type: Date,
      select: false,
    },

    preferences: {
      notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: true },
      },
      language: {
        type: String,
        default: "en",
      },
      timezone: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ================= VIRTUALS =================

userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`.trim();
});

userSchema.virtual("fullAddress").get(function () {
  if (!this.address) return "";

  const { street, city, state, country, zipCode } = this.address;
  return [street, city, state, zipCode, country].filter(Boolean).join(", ");
});

// ================= INDEXES =================
userSchema.index({ email: 1 });
userSchema.index({ role: 1, status: 1 }); // Added for better query performance
userSchema.index({ doctorConfirmationToken: 1 }); // Added for confirmation lookups

// ================= MODEL REGISTRATION (FIX DUPLICATE BUG) =================
const User = mongoose.models.User || mongoose.model("User", userSchema);

module.exports = User;