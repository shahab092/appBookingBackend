const Doctor = require("../models/Docters");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const Speciality = require("../models/Speciality");
const { generateSlots, convertTo24Hour } = require("../utils/slotUtils");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const SpecialitySuggestion = require('../models/SpecialitySuggestion');
const { uploadToR2, deleteFromR2 } = require('../utils/s3Storage');
require('dotenv').config();

// Validation Regex
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:mm (24h)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?\d{10,15}$/;
const VALID_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// Helper to calculate completeness score
const calculateCompleteness = (doctor) => {
  const weights = {
    speciality: 20,
    locations: 20,
    availability: 20,
    education: 15,
    image: 10,
    experience: 10,
    pmdcRegistrationNumber: 5,
    about: 5,
    gender: 2,
    languages: 2,
    fees: 1,
  };

  let score = 0;
  if (doctor.speciality) score += weights.speciality;
  if (doctor.locations?.length > 0) score += weights.locations;
  if (doctor.availability?.length > 0) score += weights.availability;
  if (doctor.education?.length > 0) {
    const hasValidEducation = doctor.education.every(
      (edu) => edu.degree && edu.institute && edu.startYear && edu.endYear,
    );
    if (hasValidEducation) score += weights.education;
  }
  if (doctor.image) score += weights.image;
  if (doctor.experience > 0) score += weights.experience;
  if (doctor.pmdcRegistrationNumber) score += weights.pmdcRegistrationNumber;
  if (doctor.about) score += weights.about;
  if (doctor.gender) score += weights.gender;
  if (doctor.languages?.length > 0) score += weights.languages;
  if (doctor.fees?.online > 0 || doctor.fees?.inclinic > 0)
    score += weights.fees;

  return Math.min(score, 100);
};

// Helper to check for overlapping time sessions
const hasOverlap = (sessions) => {
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  for (const day of days) {
    const daySessions = sessions
      .filter((s) => s.day === day)
      .map((s) => {
        const [startH, startM] = s.startTime.split(":").map(Number);
        const [endH, endM] = s.endTime.split(":").map(Number);
        return {
          start: startH * 60 + startM,
          end: endH * 60 + endM,
        };
      })
      .sort((a, b) => a.start - b.start);

    for (let i = 0; i < daySessions.length - 1; i++) {
      if (daySessions[i].end > daySessions[i + 1].start) {
        return true; // Overlap found
      }
    }
  }
  return false;
};

// Create a SINGLE transporter instance
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Test transporter on startup
transporter.verify(function (error, success) {
  if (error) {
    console.log("❌ SMTP Connection Error:", error.message);
    console.log("🔄 Email will fail. Check your Gmail app password.");
  } else {
    console.log("✅ SMTP Server is ready to take messages");
    console.log("📧 Using:", process.env.SMTP_USER || "dev.shahab92@gmail.com");
  }
});

// PATCH /api/doctors/:id/status
async function updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Extra security check: Ensure only admin can perform this action
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Access denied. Admin privileges required.",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "status required",
      });
    }

    // Validate status against allowed values
    const allowedStatuses = [
      "pending",
      "inprogress",
      "approved",
      "away",
      "in clinic",
      "incomplete",
    ];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Allowed values: ${allowedStatuses.join(", ")}`,
      });
    }

    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: "Doctor not found",
      });
    }

    const prevStatus = doctor.status;
    doctor.status = status;

    // Send email notification when status changes to 'approved'
    // if (status.toLowerCase() === 'approved' && prevStatus !== 'approved') {
    //   if (!doctor.email) {
    //     return res.status(400).json({
    //       success: false,
    //       error: "Cannot approve doctor without email address",
    //     });
    //   }

    //   try {
    //     const mailOptions = {
    //       from: process.env.SMTP_FROM || process.env.SMTP_USER,
    //       to: doctor.email,
    //       subject: "Doctor Account Approved - Welcome!",
    //       text: `Dear Dr. ${doctor.name},\n\nYour doctor account has been approved! You can now login to the portal and start managing your appointments.\n\nBest regards,\nThe Medical Portal Team`,
    //       html: `
    //         <h1>Account Approved!</h1>
    //         <p>Dear Dr. ${doctor.name},</p>
    //         <p>Your doctor account has been <strong>approved</strong>! You can now login to the portal and start managing your appointments.</p>
    //         <p>Best regards,<br/>The Medical Portal Team</p>
    //       `
    //     };

    //     await transporter.sendMail(mailOptions);
    //     console.log(`✅ Approval email sent to ${doctor.email}`);
    //   } catch (emailError) {
    //     console.error('❌ Failed to send approval email:', emailError);
    //     // Continue anyway - don't block the approval
    //   }
    // }

    await doctor.save();

    // Broadcast update to admins
    refreshAdminStats(req);

    return res.json({
      success: true,
      data: {
        doctorId: doctor._id,
        name: doctor.name,
        email: doctor.email,
        status: doctor.status,
        previousStatus: prevStatus,
      },
      message: `Doctor status updated to "${status}"${status === "approved" ? ". Approval email sent." : ""}`,
    });
  } catch (err) {
    console.error("Update status error:", err);
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }
}

// PATCH /api/doctors/:id/approve - Approve doctor without body
async function approveDoctor(req, res) {
  try {
    const { id } = req.params;

    // Extra security check: Ensure only admin can perform this action
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Access denied. Admin privileges required.",
      });
    }

    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: "Doctor not found",
      });
    }

    if (doctor.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Doctor is already approved.",
      });
    }

    const prevStatus = doctor.status;
    doctor.status = "approved";

    // Email logic disabled as per previous request

    await doctor.save();

    // Broadcast update to admins
    refreshAdminStats(req);

    return res.json({
      success: true,
      data: {
        doctorId: doctor._id,
        name: doctor.name,
        email: doctor.email,
        status: doctor.status,
        previousStatus: prevStatus,
      },
      message: "Doctor status successfully set to approved",
    });
  } catch (err) {
    console.error("Approve doctor error:", err);
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }
}

// GET /api/doctor/pending-count - Get count of doctors awaiting approval
async function getPendingCount(req, res) {
  try {
    const count = await Doctor.countDocuments({ status: "pending" });
    return res.json({
      success: true,
      count,
    });
  } catch (err) {
    console.error("Get pending count error:", err);
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }
}

// Helper to broadcast stats
const refreshAdminStats = async (req) => {
  try {
    const io = req.app.get("io");
    if (io) {
      const {
        broadcastAdminStats,
      } = require("../sockets/notificationSocketHandler");
      const pendingCount = await Doctor.countDocuments({ status: "pending" });
      broadcastAdminStats(io, { pendingDoctorCount: pendingCount });
    }
  } catch (err) {
    console.error("Failed to broadcast admin stats:", err);
  }
};

const updateDoctorProfile = asyncHandler(async (req, res) => {
  const {
    doctorId, // Optional for Admins
    name, // Support for creation/update
    email, // Support for creation/update
    emergencyContact, // Support for creation/update
    pmdcRegistrationNumber, // Support for creation/update
    specialityId,
    superSpeciality,
    consultationTime,
    locations,
    availability,
    education,
    address,
    about,
    gender,
    languages,
    awards,
    memberships,
    fees,
  } = req.body;

   let doctor;

   // If user is a doctor, they find/create their own profile
   if (req.user.role === "doctor") {
     doctor = await Doctor.findOne({ userId: req.user._id });

     // If record doesn't exist, create it on the fly
     if (!doctor) {
       if (!name || !pmdcRegistrationNumber) {
         throw new ApiError(
           400,
           "First-time setup requires name, and pmdcRegistrationNumber",
         );
       }
       doctor = new Doctor({
         userId: req.user._id,
         name,
         email,
         phone: emergencyContact || req.user.whatsappnumber,
         address,
         pmdcRegistrationNumber,
         status: "incomplete",
       });
     }
   } else if (req.user.role === "admin" && doctorId) {
     doctor = await Doctor.findById(doctorId);
   } else {
     throw new ApiError(403, "Not authorized to update this profile");
   }

   if (!doctor) throw new ApiError(404, "Doctor profile not found");

   // Capture original values to detect critical changes
   const original = {
     name: doctor.name,
     pmdcRegistrationNumber: doctor.pmdcRegistrationNumber,
     education: JSON.stringify(doctor.education || []),
     userId: doctor.userId.toString(),
   };

  // Update basic fields if provided
  if (name) doctor.name = name;
  if (email) {
    if (!EMAIL_REGEX.test(email))
      throw new ApiError(400, "Invalid email format");
    doctor.email = email;
  }
  if (emergencyContact) {
    if (!PHONE_REGEX.test(emergencyContact))
      throw new ApiError(
        400,
        "Invalid phone number format. Use numeric digits (10-15 characters).",
      );
    doctor.phone = emergencyContact;
  }
  if (pmdcRegistrationNumber)
    doctor.pmdcRegistrationNumber = pmdcRegistrationNumber;
  if (address) doctor.address = address;

  // Validate specialityId if provided
  if (specialityId) {
    const specialityExists = await Speciality.findById(specialityId);
    if (!specialityExists) {
      throw new ApiError(
        400,
        "Invalid speciality ID. Speciality does not exist.",
      );
    }

    // If superSpeciality is also provided, validate it belongs to this speciality
    if (superSpeciality) {
      const trimmedSuperSpec = superSpeciality.trim();
      const validSuperSpeciality = specialityExists.super_specialities.find(
        (ss) => ss.name.trim().toLowerCase() === trimmedSuperSpec.toLowerCase(),
      );

      if (!validSuperSpeciality) {
        const validOptions = specialityExists.super_specialities
          .map((ss) => ss.name)
          .join(", ");
        throw new ApiError(
          400,
          `Invalid super speciality. "${trimmedSuperSpec}" is not valid for "${specialityExists.speciality}". Available: ${validOptions}`,
        );
      }
    }

    doctor.speciality = specialityId;
  } else if (superSpeciality) {
    // If superSpeciality is provided without specialityId, check if doctor already has a speciality
    if (doctor.speciality) {
      const currentSpeciality = await Speciality.findById(doctor.speciality);
      if (currentSpeciality) {
        const trimmedSuperSpec = superSpeciality.trim();
        const validSuperSpeciality = currentSpeciality.super_specialities.find(
          (ss) =>
            ss.name.trim().toLowerCase() === trimmedSuperSpec.toLowerCase(),
        );

        if (!validSuperSpeciality) {
          const validOptions = currentSpeciality.super_specialities
            .map((ss) => ss.name)
            .join(", ");
          throw new ApiError(
            400,
            `Invalid super speciality. "${trimmedSuperSpec}" is not valid for "${currentSpeciality.speciality}". Available: ${validOptions}`,
          );
        }
      }
    } else {
      throw new ApiError(
        400,
        "Cannot set super speciality without a parent speciality.",
      );
    }
  }

  if (superSpeciality) doctor.superSpeciality = superSpeciality;
  if (consultationTime) doctor.consultationTime = consultationTime;
  if (locations) doctor.locations = locations;
  if (availability) {
    // 1. Check for overlapping schedules
    if (hasOverlap(availability)) {
      throw new ApiError(
        400,
        "Availability sessions overlap. Please check your schedule.",
      );
    }

    // 2. Validate and Link locationId for inclinic slots
    for (const session of availability) {
      // Validate Day
      if (!VALID_DAYS.includes(session.day)) {
        throw new ApiError(
          400,
          `Invalid day: ${session.day}. Must be one of: ${VALID_DAYS.join(", ")}`,
        );
      }

      // Validate Time Format (HH:mm)
      if (
        !TIME_REGEX.test(session.startTime) ||
        !TIME_REGEX.test(session.endTime)
      ) {
        throw new ApiError(
          400,
          `Invalid time format for ${session.day}. Expected HH:mm (24h), e.g., "09:00" or "14:30". Got: "${session.startTime}" - "${session.endTime}"`,
        );
      }

      // Validate Start < End
      const [startH, startM] = session.startTime.split(":").map(Number);
      const [endH, endM] = session.endTime.split(":").map(Number);
      const startTotal = startH * 60 + startM;
      const endTotal = endH * 60 + endM;

      if (startTotal >= endTotal) {
        throw new ApiError(
          400,
          `Invalid session on ${session.day}: Start time (${session.startTime}) must be strictly before end time (${session.endTime}).`,
        );
      }

      if (session.appointmentType === "inclinic") {
        if (!session.locationId) {
          if (session.locationName) {
            const matchedLocation = doctor.locations.find(
              (loc) =>
                loc.name &&
                loc.name.toLowerCase() === session.locationName.toLowerCase(),
            );
            if (matchedLocation) {
              session.locationId = matchedLocation._id;
            }
          } else if (doctor.locations.length === 1) {
            // Fallback: If both are missing and doctor has only one location, default to it
            session.locationId = doctor.locations[0]._id;
          }
        }

        if (!session.locationId) {
          throw new ApiError(
            400,
            `Location (ID or Name) is required for in-clinic session on ${session.day}`,
          );
        }

        // Check if locationId exists in doctor's locations
        const locationExists = doctor.locations.some(
          (loc) => loc._id.toString() === session.locationId.toString(),
        );
        if (!locationExists) {
          throw new ApiError(
            400,
            `Invalid location ID for ${session.day} session`,
          );
        }
      }
    }
    doctor.availability = availability;
  }
   if (education) doctor.education = education;
   if (req.body.image) doctor.image = req.body.image;
   if (req.body.experience) doctor.experience = req.body.experience;
   if (about !== undefined) doctor.about = about;
   if (gender) doctor.gender = gender;
   if (languages) doctor.languages = languages;
   if (awards) doctor.awards = awards;
   if (memberships) doctor.memberships = memberships;
   if (fees) doctor.fees = fees;

   // Update completeness score
   doctor.completenessScore = calculateCompleteness(doctor);

   // Detect if critical fields that require admin re-approval were changed
   const criticalFieldsChanged =
     (name !== undefined && name !== original.name) ||
     (pmdcRegistrationNumber !== undefined && pmdcRegistrationNumber !== original.pmdcRegistrationNumber) ||
     (education !== undefined && JSON.stringify(education) !== original.education);
     // userId is not updatable via this endpoint, but included for completeness

   // Check for mandatory fields to determine status
   const isMandatoryFilled =
     doctor.speciality &&
     doctor.locations &&
     doctor.locations.length > 0 &&
     doctor.availability &&
     doctor.availability.length > 0 &&
     doctor.education &&
     doctor.education.length > 0 &&
     doctor.pmdcRegistrationNumber;

   if (!isMandatoryFilled) {
     doctor.status = "incomplete";
   } else if (doctor.status === "incomplete") {
     // If it was incomplete and now mandatory fields are filled, set back to pending
     doctor.status = "pending";
   } else if (req.user.role === "doctor" && doctor.status === "inprogress" && criticalFieldsChanged) {
     // If doctor updates critical fields while admin is reviewing, revert to pending for re-review
     doctor.status = "pending";
   }

  await doctor.save();

  // Broadcast update to admins if status became pending
  if (doctor.status === "pending") {
    refreshAdminStats(req);
  }

  res
    .status(200)
    .json(new ApiResponse(200, doctor, "Profile updated successfully"));
});

// Manage Leaves
const addLeave = asyncHandler(async (req, res) => {
  const { date } = req.body;
  if (!date) throw new ApiError(400, "Date is required");

  const doctor = await Doctor.findOne({ userId: req.user._id });
  if (!doctor) throw new ApiError(404, "Doctor profile not found");

  const leaveDate = new Date(date).setHours(0, 0, 0, 0);
  if (
    doctor.leaves.some((l) => new Date(l).setHours(0, 0, 0, 0) === leaveDate)
  ) {
    throw new ApiError(400, "Leave already exists for this date");
  }

  doctor.leaves.push(date);
  await doctor.save();

  res
    .status(200)
    .json(new ApiResponse(200, doctor.leaves, "Leave added successfully"));
});

const removeLeave = asyncHandler(async (req, res) => {
  const { date } = req.body;
  if (!date) throw new ApiError(400, "Date is required");

  const doctor = await Doctor.findOne({ userId: req.user._id });
  if (!doctor) throw new ApiError(404, "Doctor profile not found");

  const leaveDate = new Date(date).setHours(0, 0, 0, 0);
  doctor.leaves = doctor.leaves.filter(
    (l) => new Date(l).setHours(0, 0, 0, 0) !== leaveDate,
  );
  await doctor.save();

  res
    .status(200)
    .json(new ApiResponse(200, doctor.leaves, "Leave removed successfully"));
});

// Speciality Suggestion
const suggestSpeciality = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name) throw new ApiError(400, "Speciality name is required");

  const doctor = await Doctor.findOne({ userId: req.user._id });
  if (!doctor) throw new ApiError(404, "Doctor profile not found");

  const suggestion = await SpecialitySuggestion.create({
    suggestedBy: doctor._id,
    name,
  });

  res
    .status(201)
    .json(new ApiResponse(201, suggestion, "Speciality suggestion submitted"));
});

// Get Available Slots
const getAvailableSlots = asyncHandler(async (req, res) => {
  const { doctorId, date, locationId, appointmentType } = req.query;

  if (!doctorId || !date || !appointmentType) {
    throw new ApiError(400, "doctorId, date, appointmentType are required");
  }

  if (appointmentType === "inclinic" && !locationId) {
    throw new ApiError(
      400,
      "locationId is required for in-clinic appointments",
    );
  }

  // -------------------------------
  // 1. Fetch doctor (lean = faster)
  // -------------------------------
  const doctor = await Doctor.findById(doctorId)
    .select("name status availability locations consultationTime leaves")
    .lean();

  if (!doctor) throw new ApiError(404, "Doctor not found");

  if (doctor.status !== "approved") {
    return res.json(
      new ApiResponse(200, [], "Doctor is not available for booking"),
    );
  }

  // -------------------------------
  // 2. Date validations
  // -------------------------------
  const searchDate = new Date(date);
  searchDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (searchDate < today) {
    throw new ApiError(400, "Cannot fetch slots for past dates");
  }

  if (
    doctor.leaves?.some(
      (d) => new Date(d).setHours(0, 0, 0, 0) === searchDate.getTime(),
    )
  ) {
    return res.json(new ApiResponse(200, [], "Doctor is on leave"));
  }

  // -------------------------------
  // 3. Day availability
  // -------------------------------
  const dayName = new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
  });

  const dayAvailability = doctor.availability.filter(
    (a) =>
      a.day === dayName &&
      a.appointmentType === appointmentType &&
      (appointmentType === "online" || a.locationId?.toString() === locationId),
  );

  if (!dayAvailability.length) {
    return res.json(new ApiResponse(200, [], "No availability for this day"));
  }

  // -------------------------------
  // 4. Fetch booked slots (SCOPED)
  // -------------------------------
  const appointmentFilter = {
    doctorId,
    date,
    appointmentType,
    status: { $in: ["booked", "confirmed"] },
    isDeleted: false,
  };

  if (appointmentType === "inclinic") {
    appointmentFilter.locationId = locationId;
  }

  const bookedAppointments = await Appointment.find(appointmentFilter)
    .select("timeSlot -_id")
    .lean();

  const bookedSlotSet = new Set(
    bookedAppointments.map((a) => convertTo24Hour(a.timeSlot)),
  );

  // -------------------------------
  // 5. Pre-resolve locations map
  // -------------------------------
  const locationMap = {};
  doctor.locations?.forEach((loc) => {
    locationMap[loc._id.toString()] = loc;
  });

  // -------------------------------
  // 6. Generate slots
  // -------------------------------
  const now = new Date();
  const isToday = searchDate.getTime() === today.getTime();
  const consultationTime = doctor.consultationTime || 15;

  let slots = [];

  for (const avail of dayAvailability) {
    const generatedSlots = generateSlots(
      avail.startTime,
      avail.endTime,
      consultationTime,
    );

    for (const time of generatedSlots) {
      if (isToday) {
        const [h, m] = time.split(":").map(Number);
        const slotTime = new Date();
        slotTime.setHours(h, m, 0, 0);
        if (slotTime <= now) continue;
      }

      if (bookedSlotSet.has(time)) continue;

      const loc =
        appointmentType === "inclinic"
          ? locationMap[avail.locationId?.toString()]
          : null;

      slots.push({
        time,
        appointmentType,
        locationId: loc?._id || null,
        locationName: loc?.name || "Online",
        locationPhone: loc?.phone || "N/A",
      });
    }
  }

  if (!slots.length) {
    return res.json(new ApiResponse(200, [], "No available slots"));
  }

  // -------------------------------
  // 7. Group slots
  // -------------------------------
  const grouped = { morning: [], afternoon: [], evening: [] };

  for (const slot of slots) {
    const [h, m] = slot.time.split(":").map(Number);
    const period = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";

    const hours12 = h % 12 || 12;
    const formattedTime = `${hours12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;

    grouped[period].push({ ...slot, time: formattedTime });
  }

  return res.json(
    new ApiResponse(200, grouped, "Available slots fetched successfully"),
  );
});

// Get Doctor's availability configuration (weekly schedule)
const getDoctorAvailabilityConfig = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid doctor ID");
  }

  const doctor = await Doctor.findById(id).select(
    "availability locations consultationTime",
  );
  if (!doctor) throw new ApiError(404, "Doctor not found");

  const transformedAvailability = doctor.availability.map((avail) => {
    let locationName =
      avail.appointmentType === "online"
        ? "Online"
        : avail.locationName || "Unknown Location";
    let resolvedLocationId = avail.locationId;

    if (avail.appointmentType === "inclinic") {
      if (avail.locationId) {
        const loc = doctor.locations.find(
          (l) => l._id.toString() === avail.locationId.toString(),
        );
        if (loc) locationName = loc.name;
      } else {
        // Try resolving resolve from Name
        if (avail.locationName) {
          const loc = doctor.locations.find(
            (l) =>
              l.name &&
              l.name.toLowerCase() === avail.locationName.toLowerCase(),
          );
          if (loc) {
            resolvedLocationId = loc._id;
            locationName = loc.name;
          }
        }
        // Fallback: If only one location exists
        if (!resolvedLocationId && doctor.locations.length === 1) {
          resolvedLocationId = doctor.locations[0]._id;
          locationName = doctor.locations[0].name;
        }
      }
    }

    return {
      day: avail.day,
      startTime: avail.startTime,
      endTime: avail.endTime,
      appointmentType: avail.appointmentType,
      locationId: resolvedLocationId,
      locationName,
    };
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        consultationTime: doctor.consultationTime,
        availability: transformedAvailability,
      },
      "Doctor availability config fetched successfully",
    ),
  );
});

const getDoctors = async (req, res, next) => {
  try {
    const { status } = req.query;

    const filter = {};
    if (status) {
      filter.status = status;
    }

    // Find in Doctor collection
    const doctors = await Doctor.find(filter)
      .populate("userId", "whatsappnumber role -_id") // Populate user details, exclude _id duplicate
      .populate("speciality") // Populate full speciality details including super_specialities
      .sort({ createdAt: -1 });

    // Transform the response to use proper field names
    const transformedDoctors = doctors.map((doctor) => {
      const docObj = doctor.toObject();

      // Extract services from the matching super-speciality
      let services = [];
      if (docObj.speciality && docObj.superSpeciality) {
        const matchingSuperSpec = docObj.speciality.super_specialities?.find(
          (ss) =>
            ss.name.trim().toLowerCase() ===
            docObj.superSpeciality.trim().toLowerCase(),
        );
        services = matchingSuperSpec?.services || [];
      }

      return {
        doctorId: docObj._id,
        userId: docObj.userId?._id,
        whatsappnumber: docObj.userId?.whatsappnumber,
        role: docObj.userId?.role,
        name: docObj.name,
        email: docObj.email,
        emergencyContact: docObj.phone,
        address: docObj.address,
        speciality: docObj.speciality?.speciality || null,
        specialityName: docObj.speciality?.speciality || null,
        specialityId: docObj.speciality?._id || docObj.speciality || null,
        superSpeciality: docObj.superSpeciality,
        services: services,
        consultationTime: docObj.consultationTime,
        locations:
          docObj.locations?.map((loc) => ({
            hospitalId: loc._id,
            name: loc.name,
            address: loc.address,
            phone: loc.phone,
            coordinates: loc.coordinates,
          })) || [],
        availability:
          docObj.availability?.map((avail) => {
            let resolvedLocationId = avail.locationId;
            if (avail.appointmentType === "inclinic" && !resolvedLocationId) {
              if (avail.locationName) {
                const loc = docObj.locations.find(
                  (l) =>
                    l.name &&
                    l.name.toLowerCase() === avail.locationName.toLowerCase(),
                );
                if (loc) resolvedLocationId = loc._id;
              }
              if (!resolvedLocationId && docObj.locations.length === 1) {
                resolvedLocationId = docObj.locations[0]._id;
              }
            }
            return {
              day: avail.day,
              startTime: avail.startTime,
              endTime: avail.endTime,
              appointmentType: avail.appointmentType,
              locationId: resolvedLocationId,
            };
          }) || [],
        education:
          docObj.education?.map((edu) => ({
            degree: edu.degree,
            institute: edu.institute,
            startYear: edu.startYear,
            endYear: edu.endYear,
          })) || [],
        isAvailable: docObj.isAvailable,
        pmdcRegistrationNumber: docObj.pmdcRegistrationNumber,
        status: docObj.status,
        image: docObj.image,
        experience: docObj.experience,
        averageRating: docObj.averageRating,
        numReviews: docObj.numReviews,
        leaves: docObj.leaves,
        completenessScore: docObj.completenessScore,
        registrationDate: docObj.registrationDate,
        about: docObj.about,
        gender: docObj.gender,
        languages: docObj.languages,
        awards: docObj.awards,
        memberships: docObj.memberships,
        fees: docObj.fees,
      };
    });

    res.status(200).json({
      success: true,
      count: transformedDoctors.length,
      data: transformedDoctors,
    });
  } catch (error) {
    next(error);
  }
};

// Get single doctor by ID
const getDoctorById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid doctor ID");
  }

  const doctor = await Doctor.findById(id)
    .populate("userId", "whatsappnumber role -_id")
    .populate("speciality");

  if (!doctor) {
    throw new ApiError(404, "Doctor not found");
  }

  const docObj = doctor.toObject();

  // Extract services from the matching super-speciality
  let services = [];
  if (docObj.speciality && docObj.superSpeciality) {
    const matchingSuperSpec = docObj.speciality.super_specialities?.find(
      (ss) =>
        ss.name.trim().toLowerCase() ===
        docObj.superSpeciality.trim().toLowerCase(),
    );
    services = matchingSuperSpec?.services || [];
  }

  const transformedDoctor = {
    doctorId: docObj._id,
    userId: docObj.userId?._id,
    whatsappnumber: docObj.userId?.whatsappnumber,
    role: docObj.userId?.role,
    name: docObj.name,
    email: docObj.email,
    emergencyContact: docObj.phone,
    address: docObj.address,
    speciality: docObj.speciality?.speciality || null,
    specialityName: docObj.speciality?.speciality || null,
    specialityId: docObj.speciality?._id || docObj.speciality || null,
    superSpeciality: docObj.superSpeciality,
    services: services,
    consultationTime: docObj.consultationTime,
    locations:
      docObj.locations?.map((loc) => ({
        hospitalId: loc._id,
        name: loc.name,
        address: loc.address,
        phone: loc.phone,
        coordinates: loc.coordinates,
      })) || [],
    availability:
      docObj.availability?.map((avail) => {
        let resolvedLocationId = avail.locationId;
        if (avail.appointmentType === "inclinic" && !resolvedLocationId) {
          if (avail.locationName) {
            const loc = docObj.locations.find(
              (l) =>
                l.name &&
                l.name.toLowerCase() === avail.locationName.toLowerCase(),
            );
            if (loc) resolvedLocationId = loc._id;
          }
          if (!resolvedLocationId && docObj.locations.length === 1) {
            resolvedLocationId = docObj.locations[0]._id;
          }
        }
        return {
          day: avail.day,
          startTime: avail.startTime,
          endTime: avail.endTime,
          appointmentType: avail.appointmentType,
          locationId: resolvedLocationId,
        };
      }) || [],
    education:
      docObj.education?.map((edu) => ({
        degree: edu.degree,
        institute: edu.institute,
        startYear: edu.startYear,
        endYear: edu.endYear,
      })) || [],
    isAvailable: docObj.isAvailable,
    pmdcRegistrationNumber: docObj.pmdcRegistrationNumber,
    status: docObj.status,
    image: docObj.image,
    experience: docObj.experience,
    averageRating: docObj.averageRating,
    numReviews: docObj.numReviews,
    leaves: docObj.leaves,
    completenessScore: docObj.completenessScore,
    registrationDate: docObj.registrationDate,
    about: docObj.about,
    gender: docObj.gender,
    languages: docObj.languages,
    awards: docObj.awards,
    memberships: docObj.memberships,
    fees: docObj.fees,
  };

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        transformedDoctor,
        "Doctor details fetched successfully",
      ),
    );
});

// Search doctors by name and/or speciality
const searchDoctors = asyncHandler(async (req, res) => {
  const { search, specialityId, city } = req.query;

  // Validate search query (minimum 3 characters)
  if (search && search.length < 3) {
    throw new ApiError(400, "Search query must be at least 3 characters");
  }

  const filter = { status: "approved" }; // Only search approved doctors

  // Add name search filter (case-insensitive)
  if (search) {
    filter.name = { $regex: search, $options: "i" };
  }

  // Add speciality filter
  if (specialityId) {
    filter.speciality = specialityId;
  }

  // Add city filter (case-insensitive)
  if (city) {
    filter["address.city"] = { $regex: city, $options: "i" };
  }

  const doctors = await Doctor.find(filter)
    .populate("userId", "whatsappnumber role -_id")
    .populate("speciality")
    .sort({ name: 1 });

  // Transform the response
  const transformedDoctors = doctors.map((doctor) => {
    const docObj = doctor.toObject();

    let services = [];
    if (docObj.speciality && docObj.superSpeciality) {
      const matchingSuperSpec = docObj.speciality.super_specialities?.find(
        (ss) =>
          ss.name.trim().toLowerCase() ===
          docObj.superSpeciality.trim().toLowerCase(),
      );
      services = matchingSuperSpec?.services || [];
    }

    return {
      doctorId: docObj._id,
      userId: docObj.userId?._id,
      whatsappnumber: docObj.userId?.whatsappnumber,
      role: docObj.userId?.role,
      name: docObj.name,
      email: docObj.email,
      emergencyContact: docObj.phone,
      address: docObj.address,
      speciality: docObj.speciality?.speciality || null,
      specialityName: docObj.speciality?.speciality || null,
      specialityId: docObj.speciality?._id || docObj.speciality || null,
      superSpeciality: docObj.superSpeciality,
      services: services,
      consultationTime: docObj.consultationTime,
      locations:
        docObj.locations?.map((loc) => ({
          hospitalId: loc._id,
          name: loc.name,
          address: loc.address,
          phone: loc.phone,
          coordinates: loc.coordinates,
        })) || [],
      availability:
        docObj.availability?.map((avail) => {
          let resolvedLocationId = avail.locationId;
          if (avail.appointmentType === "inclinic" && !resolvedLocationId) {
            if (avail.locationName) {
              const loc = docObj.locations.find(
                (l) =>
                  l.name &&
                  l.name.toLowerCase() === avail.locationName.toLowerCase(),
              );
              if (loc) resolvedLocationId = loc._id;
            }
            if (!resolvedLocationId && docObj.locations.length === 1) {
              resolvedLocationId = docObj.locations[0]._id;
            }
          }
          return {
            day: avail.day,
            startTime: avail.startTime,
            endTime: avail.endTime,
            appointmentType: avail.appointmentType,
            locationId: resolvedLocationId,
          };
        }) || [],
      education:
        docObj.education?.map((edu) => ({
          degree: edu.degree,
          institute: edu.institute,
          startYear: edu.startYear,
          endYear: edu.endYear,
        })) || [],
      isAvailable: docObj.isAvailable,
      pmdcRegistrationNumber: docObj.pmdcRegistrationNumber,
      status: docObj.status,
      image: docObj.image,
      experience: docObj.experience,
      averageRating: docObj.averageRating,
      numReviews: docObj.numReviews,
      leaves: docObj.leaves,
      completenessScore: docObj.completenessScore,
      registrationDate: docObj.registrationDate,
      fees: docObj.fees,
    };
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { count: transformedDoctors.length, doctors: transformedDoctors },
        "Search results fetched successfully",
      ),
    );
});

// Get unique cities for lookup
const getCities = asyncHandler(async (req, res) => {
  const cities = await Doctor.distinct("address.city", {
    status: "approved",
    "address.city": { $ne: null, $ne: "" },
  });

  // Sort alphabetically
  const sortedCities = cities.sort((a, b) => a.localeCompare(b));

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { count: sortedCities.length, cities: sortedCities },
        "Cities fetched successfully",
      ),
    );
});

// Admin-only: Create single doctor account + profile
const createDoctorByAdmin = asyncHandler(async (req, res) => {
  const {
    whatsappnumber,
    password,
    name,
    email,
    emergencyContact,
    address,
    pmdcRegistrationNumber,
    specialityId,
    superSpeciality,
    consultationTime,
    locations,
    availability,
    education,
    experience,
    image,
    status,
  } = req.body;

  if (
    !whatsappnumber ||
    !password ||
    !name ||
    !email ||
    !pmdcRegistrationNumber
  ) {
    throw new ApiError(
      400,
      "WhatsApp number, password, name, email, and PMDC number are required",
    );
  }

  const existingUser = await User.findOne({ whatsappnumber });
  if (existingUser)
    throw new ApiError(400, "User with this WhatsApp number already exists");

  const existingDoctor = await Doctor.findOne({ email });
  if (existingDoctor)
    throw new ApiError(400, "Doctor with this email already exists");

  if (specialityId) {
    const specialityExists = await Speciality.findById(specialityId);
    if (!specialityExists) throw new ApiError(400, "Invalid speciality ID");

    if (superSpeciality) {
      const trimmedSuperSpec = superSpeciality.trim();
      const validSuperSpeciality = specialityExists.super_specialities.find(
        (ss) => ss.name.trim().toLowerCase() === trimmedSuperSpec.toLowerCase(),
      );

      if (!validSuperSpeciality) {
        const validOptions = specialityExists.super_specialities
          .map((ss) => ss.name)
          .join(", ");
        throw new ApiError(
          400,
          `Invalid super speciality "${trimmedSuperSpec}" for ${specialityExists.speciality}. Available: ${validOptions}`,
        );
      }
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await User.create({
    whatsappnumber,
    password: hashedPassword,
    role: "doctor",
    isVerified: true,
  });

  const newDoctor = await Doctor.create({
    userId: newUser._id,
    name,
    email,
    phone: emergencyContact || whatsappnumber,
    address,
    pmdcRegistrationNumber,
    speciality: specialityId,
    superSpeciality,
    consultationTime: consultationTime || 15,
    locations: locations || [],
    availability: [],
    education: education || [],
    experience: experience || 0,
    image,
    status: status || "approved",
  });

  // Now process availability with resolved IDs
  if (availability && availability.length > 0) {
    const processedAvailability = availability.map((avail) => {
      let resolvedLocationId = avail.locationId;
      if (avail.appointmentType === "inclinic" && !resolvedLocationId) {
        if (avail.locationName) {
          const matchedLoc = newDoctor.locations.find(
            (loc) =>
              loc.name &&
              loc.name.toLowerCase() === avail.locationName.toLowerCase(),
          );
          if (matchedLoc) resolvedLocationId = matchedLoc._id;
        }
        // Fallback: default to single location
        if (!resolvedLocationId && newDoctor.locations.length === 1) {
          resolvedLocationId = newDoctor.locations[0]._id;
        }
      }
      return { ...avail, locationId: resolvedLocationId };
    });
    newDoctor.availability = processedAvailability;
    await newDoctor.save();
  }

  res.status(201).json(
    new ApiResponse(
      201,
      {
        userId: newUser._id,
        doctorId: newDoctor._id,
        name: newDoctor.name,
        email: newDoctor.email,
        status: newDoctor.status,
      },
      "Doctor account created successfully",
    ),
  );

  // Broadcast update to admins if needed
  if (newDoctor.status === "pending") {
    refreshAdminStats(req);
  }
});

// Admin-only: Bulk create doctors (accepts array)
const bulkCreateDoctors = asyncHandler(async (req, res) => {
  const doctors = req.body;

  if (!Array.isArray(doctors) || doctors.length === 0) {
    throw new ApiError(400, "Please provide an array of doctor objects");
  }

  const results = { success: [], failed: [] };

  for (let i = 0; i < doctors.length; i++) {
    const doctor = doctors[i];
    try {
      const {
        whatsappnumber,
        password,
        name,
        email,
        emergencyContact,
        address,
        pmdcRegistrationNumber,
        specialityId,
        superSpeciality,
        consultationTime,
        locations,
        availability,
        education,
        experience,
        image,
        status,
      } = doctor;

      if (
        !whatsappnumber ||
        !password ||
        !name ||
        !email ||
        !pmdcRegistrationNumber
      )
        throw new Error("Missing required fields");

      const existingUser = await User.findOne({ whatsappnumber });
      if (existingUser) throw new Error("WhatsApp number already exists");

      const existingDoctor = await Doctor.findOne({ email });
      if (existingDoctor) throw new Error("Email already exists");

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await User.create({
        whatsappnumber,
        password: hashedPassword,
        role: "doctor",
        isVerified: true,
      });

      const newDoctor = await Doctor.create({
        userId: newUser._id,
        name,
        email,
        phone: emergencyContact || whatsappnumber,
        address,
        pmdcRegistrationNumber,
        speciality: specialityId,
        superSpeciality,
        consultationTime: consultationTime || 15,
        locations: locations || [],
        availability: [],
        education: education || [],
        experience: experience || 0,
        image,
        status: status || "approved",
      });

      // Process availability to link location IDs
      if (availability && availability.length > 0) {
        const processedAvailability = availability.map((avail) => {
          let resolvedLocationId = avail.locationId;
          if (avail.appointmentType === "inclinic" && !resolvedLocationId) {
            if (avail.locationName) {
              const matchedLoc = newDoctor.locations.find(
                (loc) =>
                  loc.name &&
                  loc.name.toLowerCase() === avail.locationName.toLowerCase(),
              );
              if (matchedLoc) resolvedLocationId = matchedLoc._id;
            }
            // Fallback: default to single location
            if (!resolvedLocationId && newDoctor.locations.length === 1) {
              resolvedLocationId = newDoctor.locations[0]._id;
            }
          }
          return { ...avail, locationId: resolvedLocationId };
        });
        newDoctor.availability = processedAvailability;
        await newDoctor.save();
      }

      results.success.push({
        index: i,
        userId: newUser._id,
        doctorId: newDoctor._id,
        name: newDoctor.name,
        email: newDoctor.email,
      });
    } catch (error) {
      results.failed.push({
        index: i,
        email: doctor.email,
        error: error.message,
      });
    }
  }

  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        results,
        `Created ${results.success.length} doctors, ${results.failed.length} failed`,
      ),
    );

  // Broadcast update to admins if any success
  if (results.success.length > 0) {
    refreshAdminStats(req);
  }
});

/**
 * Controller to handle doctor image upload to Cloudflare R2
 */
const uploadDoctorImage = asyncHandler(async (req, res) => {
  const { doctorId } = req.body; // Optional: Admins can specify doctorId

  if (!req.file) {
    throw new ApiError(400, "No image file provided");
  }

  let doctor;
  if (req.user.role === "admin" && doctorId) {
    doctor = await Doctor.findById(doctorId);
  } else {
    doctor = await Doctor.findOne({ userId: req.user._id });
  }

  if (!doctor) {
    throw new ApiError(404, "Doctor profile not found");
  }

  // If doctor already has an image, delete the old one from R2
  if (doctor.image) {
    console.log("Cleanup: Deleting old image...");
    await deleteFromR2(doctor.image);
  }

  // Upload to R2
  const imageUrl = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);

  // Update doctor profile with the new image URL
  doctor.image = imageUrl;
  await doctor.save();

  res.status(200).json(
    new ApiResponse(200, { imageUrl }, "Doctor image uploaded successfully")
  );
});

const getMe = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findOne({ userId: req.user._id });
  if (!doctor) {
    throw new ApiError(404, "Doctor profile not found");
  }
  res.status(200).json(new ApiResponse(200, doctor, "Doctor profile fetched successfully"));
});

/**
 * Controller to handle doctor image upload to Cloudflare R2
 */


module.exports = {
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
  uploadDoctorImage,
  getPendingCount,
  getMe,
};
