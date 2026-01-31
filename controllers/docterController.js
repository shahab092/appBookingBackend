const Doctor = require('../models/Docters');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Speciality = require('../models/Speciality');
const { generateSlots } = require('../utils/slotUtils');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const SpecialitySuggestion = require('../models/SpecialitySuggestion');
require('dotenv').config();

// Helper to calculate completeness score
const calculateCompleteness = (doctor) => {
  const weights = {
    speciality: 20,
    locations: 20,
    availability: 20,
    education: 15,
    image: 10,
    experience: 10,
    pmdcRegistrationNumber: 5
  };

  let score = 0;
  if (doctor.speciality) score += weights.speciality;
  if (doctor.locations?.length > 0) score += weights.locations;
  if (doctor.availability?.length > 0) score += weights.availability;
  if (doctor.education?.length > 0) {
    const hasValidEducation = doctor.education.every(edu => edu.degree && edu.institute && edu.startYear && edu.endYear);
    if (hasValidEducation) score += weights.education;
  }
  if (doctor.image) score += weights.image;
  if (doctor.experience > 0) score += weights.experience;
  if (doctor.pmdcRegistrationNumber) score += weights.pmdcRegistrationNumber;

  return score;
};

// Helper to check for overlapping time sessions
const hasOverlap = (sessions) => {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  for (const day of days) {
    const daySessions = sessions
      .filter(s => s.day === day)
      .map(s => {
        const [startH, startM] = s.startTime.split(':').map(Number);
        const [endH, endM] = s.endTime.split(':').map(Number);
        return {
          start: startH * 60 + startM,
          end: endH * 60 + endM
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
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Test transporter on startup
transporter.verify(function (error, success) {
  if (error) {
    console.log('❌ SMTP Connection Error:', error.message);
    console.log('🔄 Email will fail. Check your Gmail app password.');
  } else {
    console.log('✅ SMTP Server is ready to take messages');
    console.log('📧 Using:', process.env.SMTP_USER || 'dev.shahab92@gmail.com');
  }
});


// PATCH /api/doctors/:id/status
async function updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "status required",
      });
    }

    // Validate status against allowed values
    const allowedStatuses = ['pending', 'inprogress', 'approved', 'away', 'in clinic', 'incomplete'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Allowed values: ${allowedStatuses.join(', ')}`,
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
    if (status.toLowerCase() === 'approved' && prevStatus !== 'approved') {
      if (!doctor.email) {
        return res.status(400).json({
          success: false,
          error: "Cannot approve doctor without email address",
        });
      }

      try {
        const mailOptions = {
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: doctor.email,
          subject: "Doctor Account Approved - Welcome!",
          text: `Dear Dr. ${doctor.name},\n\nYour doctor account has been approved! You can now login to the portal and start managing your appointments.\n\nBest regards,\nThe Medical Portal Team`,
          html: `
            <h1>Account Approved!</h1>
            <p>Dear Dr. ${doctor.name},</p>
            <p>Your doctor account has been <strong>approved</strong>! You can now login to the portal and start managing your appointments.</p>
            <p>Best regards,<br/>The Medical Portal Team</p>
          `
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Approval email sent to ${doctor.email}`);
      } catch (emailError) {
        console.error('❌ Failed to send approval email:', emailError);
        // Continue anyway - don't block the approval
      }
    }

    await doctor.save();

    return res.json({
      success: true,
      data: {
        doctorId: doctor._id,
        name: doctor.name,
        email: doctor.email,
        status: doctor.status,
        previousStatus: prevStatus
      },
      message: `Doctor status updated to "${status}"${status === 'approved' ? '. Approval email sent.' : ''}`
    });
  } catch (err) {
    console.error("Update status error:", err);
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }
}


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
    address
  } = req.body;

  let doctor;

  // If user is a doctor, they find/create their own profile
  if (req.user.role === 'doctor') {
    doctor = await Doctor.findOne({ userId: req.user._id });

    // If record doesn't exist, create it on the fly
    if (!doctor) {
      if (!name || !pmdcRegistrationNumber) {
        throw new ApiError(400, "First-time setup requires name, and pmdcRegistrationNumber");
      }
      doctor = new Doctor({
        userId: req.user._id,
        name,
        email,
        phone: emergencyContact || req.user.whatsappnumber,
        address,
        pmdcRegistrationNumber,
        status: "incomplete"
      });
    }
  } else if (req.user.role === 'admin' && doctorId) {
    doctor = await Doctor.findById(doctorId);
  } else {
    throw new ApiError(403, "Not authorized to update this profile");
  }

  if (!doctor) throw new ApiError(404, "Doctor profile not found");

  // Update basic fields if provided
  if (name) doctor.name = name;
  if (email) doctor.email = email;
  if (emergencyContact) doctor.phone = emergencyContact;
  if (pmdcRegistrationNumber) doctor.pmdcRegistrationNumber = pmdcRegistrationNumber;
  if (address) doctor.address = address;

  // Validate specialityId if provided
  if (specialityId) {
    const specialityExists = await Speciality.findById(specialityId);
    if (!specialityExists) {
      throw new ApiError(400, "Invalid speciality ID. Speciality does not exist.");
    }

    // If superSpeciality is also provided, validate it belongs to this speciality
    if (superSpeciality) {
      const validSuperSpeciality = specialityExists.super_specialities.find(
        ss => ss.name.toLowerCase() === superSpeciality.toLowerCase()
      );

      if (!validSuperSpeciality) {
        throw new ApiError(
          400,
          `Invalid super speciality. "${superSpeciality}" is not a valid sub-speciality of "${specialityExists.speciality}".`
        );
      }
    }

    doctor.speciality = specialityId;
  } else if (superSpeciality) {
    // If superSpeciality is provided without specialityId, check if doctor already has a speciality
    if (doctor.speciality) {
      const currentSpeciality = await Speciality.findById(doctor.speciality);
      if (currentSpeciality) {
        const validSuperSpeciality = currentSpeciality.super_specialities.find(
          ss => ss.name.toLowerCase() === superSpeciality.toLowerCase()
        );

        if (!validSuperSpeciality) {
          throw new ApiError(
            400,
            `Invalid super speciality. "${superSpeciality}" is not a valid sub-speciality of "${currentSpeciality.speciality}".`
          );
        }
      }
    } else {
      throw new ApiError(400, "Cannot set super speciality without a parent speciality.");
    }
  }

  if (superSpeciality) doctor.superSpeciality = superSpeciality;
  if (consultationTime) doctor.consultationTime = consultationTime;
  if (locations) doctor.locations = locations;
  if (availability) {
    // 1. Check for overlapping schedules
    if (hasOverlap(availability)) {
      throw new ApiError(400, "Availability sessions overlap. Please check your schedule.");
    }

    // 2. Validate and Link locationId for inclinic slots
    for (const session of availability) {
      if (session.appointmentType === 'inclinic') {
        // If locationId is missing, try to find by Name in the doctor's locations
        if (!session.locationId && session.locationName) {
          const matchedLocation = doctor.locations.find(
            loc => loc.name.toLowerCase() === session.locationName.toLowerCase()
          );
          if (matchedLocation) {
            session.locationId = matchedLocation._id;
          }
        }

        if (!session.locationId) {
          throw new ApiError(400, `Location (ID or Name) is required for in-clinic session on ${session.day}`);
        }

        // Check if locationId exists in doctor's locations
        const locationExists = doctor.locations.some(loc => loc._id.toString() === session.locationId.toString());
        if (!locationExists) {
          throw new ApiError(400, `Invalid location ID for ${session.day} session`);
        }
      }
    }
    doctor.availability = availability;
  }
  if (education) doctor.education = education;
  if (req.body.image) doctor.image = req.body.image;
  if (req.body.experience) doctor.experience = req.body.experience;

  // Update completeness score
  doctor.completenessScore = calculateCompleteness(doctor);

  // Check for mandatory fields to determine status
  const isMandatoryFilled =
    doctor.speciality &&
    doctor.locations && doctor.locations.length > 0 &&
    doctor.availability && doctor.availability.length > 0 &&
    doctor.education && doctor.education.length > 0 &&
    doctor.pmdcRegistrationNumber;

  if (!isMandatoryFilled) {
    doctor.status = 'incomplete';
  } else if (doctor.status === 'incomplete') {
    // If it was incomplete and now mandatory fields are filled, set back to pending
    doctor.status = 'pending';
  }

  await doctor.save();

  res.status(200).json(
    new ApiResponse(200, doctor, "Doctor profile updated successfully")
  );
});

// Manage Leaves
const addLeave = asyncHandler(async (req, res) => {
  const { date } = req.body;
  if (!date) throw new ApiError(400, "Date is required");

  const doctor = await Doctor.findOne({ userId: req.user._id });
  if (!doctor) throw new ApiError(404, "Doctor profile not found");

  const leaveDate = new Date(date).setHours(0, 0, 0, 0);
  if (doctor.leaves.some(l => new Date(l).setHours(0, 0, 0, 0) === leaveDate)) {
    throw new ApiError(400, "Leave already exists for this date");
  }

  doctor.leaves.push(date);
  await doctor.save();

  res.status(200).json(new ApiResponse(200, doctor.leaves, "Leave added successfully"));
});

const removeLeave = asyncHandler(async (req, res) => {
  const { date } = req.body;
  if (!date) throw new ApiError(400, "Date is required");

  const doctor = await Doctor.findOne({ userId: req.user._id });
  if (!doctor) throw new ApiError(404, "Doctor profile not found");

  const leaveDate = new Date(date).setHours(0, 0, 0, 0);
  doctor.leaves = doctor.leaves.filter(l => new Date(l).setHours(0, 0, 0, 0) !== leaveDate);
  await doctor.save();

  res.status(200).json(new ApiResponse(200, doctor.leaves, "Leave removed successfully"));
});

// Speciality Suggestion
const suggestSpeciality = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name) throw new ApiError(400, "Speciality name is required");

  const doctor = await Doctor.findOne({ userId: req.user._id });
  if (!doctor) throw new ApiError(404, "Doctor profile not found");

  const suggestion = await SpecialitySuggestion.create({
    suggestedBy: doctor._id,
    name
  });

  res.status(201).json(new ApiResponse(201, suggestion, "Speciality suggestion submitted"));
});

// Get Available Slots
const getAvailableSlots = asyncHandler(async (req, res) => {
  const { doctorId, date, locationId, appointmentType } = req.query; // date format: YYYY-MM-DD

  if (!doctorId || !date || !appointmentType) {
    throw new ApiError(400, "Doctor ID, date, and appointmentType (online/inclinic) are required");
  }

  if (appointmentType === 'inclinic' && !locationId) {
    throw new ApiError(400, "locationId is required for in-clinic appointments");
  }

  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new ApiError(404, "Doctor not found");

  // 1. Check if doctor is "away" or not "approved"
  if (doctor.status === 'away') {
    return res.status(200).json(new ApiResponse(200, [], `Dr. ${doctor.name} is currently away and not taking appointments.`));
  }
  if (doctor.status !== 'approved') {
    return res.status(200).json(new ApiResponse(200, [], "This doctor's account is not yet active for bookings."));
  }

  // 2. Check if doctor is on leave
  const searchDate = new Date(date).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);

  if (searchDate < today) {
    return res.status(400).json(new ApiResponse(400, [], "Cannot fetch slots for past dates."));
  }

  const isOnLeave = doctor.leaves.some(l => new Date(l).setHours(0, 0, 0, 0) === searchDate);
  if (isOnLeave) {
    return res.status(200).json(new ApiResponse(200, [], `Dr. ${doctor.name} is on leave for the selected date.`));
  }

  // 3. Get day of week
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[new Date(date).getDay()];

  // 4. Find availability for this day
  const dayAvailability = doctor.availability.filter(a =>
    a.day === dayName &&
    a.appointmentType === appointmentType &&
    (!locationId || a.locationId?.toString() === locationId.toString())
  );

  if (dayAvailability.length === 0) {
    const locNote = locationId ? "at this specific location" : "";
    return res.status(200).json(new ApiResponse(200, [], `Doctor has no ${appointmentType} sessions scheduled for ${dayName} ${locNote}.`));
  }

  // 5. Get already booked slots
  const bookedAppointments = await Appointment.find({
    doctorId: doctor._id,
    date,
    status: 'confirmed',
    isDeleted: false
  });

  const bookedSlots = bookedAppointments.map(a => a.timeSlot);

  // 6. Generate enriched slots
  let enrichedSlots = [];
  const now = new Date();
  const isToday = searchDate === today;

  for (const avail of dayAvailability) {
    const slots = generateSlots(avail.startTime, avail.endTime, doctor.consultationTime || 15);

    let locationName = "N/A";
    let locationPhone = "N/A";

    if (avail.appointmentType === 'inclinic' && avail.locationId) {
      const locData = doctor.locations.find(loc => loc._id.toString() === avail.locationId.toString());
      if (locData) {
        locationName = locData.name;
        locationPhone = locData.phone || "N/A";
      }
    }

    const sessionSlots = slots
      .filter(time => {
        // Filter out past slots if the date is today
        if (!isToday) return true;
        const [hours, minutes] = time.split(':').map(Number);
        const slotTime = new Date();
        slotTime.setHours(hours, minutes, 0, 0);
        return slotTime > now;
      })
      .map(time => ({
        time,
        appointmentType: avail.appointmentType,
        locationId: avail.locationId,
        locationName: avail.appointmentType === 'online' ? "Online" : locationName,
        locationPhone: avail.appointmentType === 'online' ? "N/A" : locationPhone,
        isBooked: bookedSlots.includes(time)
      }));

    enrichedSlots = [...enrichedSlots, ...sessionSlots];
  }

  // Filter out booked slots
  const availableEnrichedSlots = enrichedSlots.filter(slot => !slot.isBooked);

  if (availableEnrichedSlots.length === 0) {
    return res.status(200).json(new ApiResponse(200, [], "All time slots for this session are already booked. Please try another date or location."));
  }

  // Grouping logic
  const groupedSlots = {
    morning: [],
    afternoon: [],
    evening: []
  };

  const formatTo12Hour = (time24) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'pm' : 'am';
    const hours12 = hours % 12 || 12;
    return `${hours12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  availableEnrichedSlots.forEach(slot => {
    const [hours] = slot.time.split(':').map(Number);
    const formattedTime = formatTo12Hour(slot.time);

    const slotData = { ...slot, time: formattedTime };

    if (hours < 12) {
      groupedSlots.morning.push(slotData);
    } else if (hours >= 12 && hours < 17) {
      groupedSlots.afternoon.push(slotData);
    } else {
      groupedSlots.evening.push(slotData);
    }
  });

  res.status(200).json(
    new ApiResponse(200, groupedSlots, "Available slots fetched successfully")
  );
});

// Get Doctor's availability configuration (weekly schedule)
const getDoctorAvailabilityConfig = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const doctor = await Doctor.findById(id).select('availability locations consultationTime');
  if (!doctor) throw new ApiError(404, "Doctor not found");

  const transformedAvailability = doctor.availability.map(avail => {
    let locationName = "Online";
    if (avail.appointmentType === 'inclinic' && avail.locationId) {
      const loc = doctor.locations.find(l => l._id.toString() === avail.locationId.toString());
      locationName = loc ? loc.name : "Unknown Location";
    }

    return {
      day: avail.day,
      startTime: avail.startTime,
      endTime: avail.endTime,
      appointmentType: avail.appointmentType,
      locationId: avail.locationId,
      locationName
    };
  });

  res.status(200).json(
    new ApiResponse(200, {
      consultationTime: doctor.consultationTime,
      availability: transformedAvailability
    }, "Doctor availability config fetched successfully")
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
      .populate('userId', 'whatsappnumber role -_id') // Populate user details, exclude _id duplicate
      .populate('speciality') // Populate full speciality details including super_specialities
      .sort({ createdAt: -1 });

    // Transform the response to use proper field names
    const transformedDoctors = doctors.map(doctor => {
      const docObj = doctor.toObject();

      // Extract services from the matching super-speciality
      let services = [];
      if (docObj.speciality && docObj.superSpeciality) {
        const matchingSuperSpec = docObj.speciality.super_specialities?.find(
          ss => ss.name.toLowerCase() === docObj.superSpeciality.toLowerCase()
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
        specialityId: docObj.speciality?._id || null,
        superSpeciality: docObj.superSpeciality,
        services: services,
        consultationTime: docObj.consultationTime,
        locations: docObj.locations?.map(loc => ({
          hospitalId: loc._id,
          name: loc.name,
          phone: loc.phone,
          coordinates: loc.coordinates
        })) || [],
        availability: docObj.availability?.map(avail => ({
          day: avail.day,
          startTime: avail.startTime,
          endTime: avail.endTime,
          appointmentType: avail.appointmentType,
          locationId: avail.locationId
        })) || [],
        education: docObj.education?.map(edu => ({
          degree: edu.degree,
          institute: edu.institute,
          startYear: edu.startYear,
          endYear: edu.endYear
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

  const doctor = await Doctor.findById(id)
    .populate('userId', 'whatsappnumber role -_id')
    .populate('speciality');

  if (!doctor) {
    throw new ApiError(404, "Doctor not found");
  }

  const docObj = doctor.toObject();

  // Extract services from the matching super-speciality
  let services = [];
  if (docObj.speciality && docObj.superSpeciality) {
    const matchingSuperSpec = docObj.speciality.super_specialities?.find(
      ss => ss.name.toLowerCase() === docObj.superSpeciality.toLowerCase()
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
    specialityId: docObj.speciality?._id || null,
    superSpeciality: docObj.superSpeciality,
    services: services,
    consultationTime: docObj.consultationTime,
    locations: docObj.locations?.map(loc => ({
      hospitalId: loc._id,
      name: loc.name,
      phone: loc.phone,
      coordinates: loc.coordinates
    })) || [],
    availability: docObj.availability?.map(avail => ({
      day: avail.day,
      startTime: avail.startTime,
      endTime: avail.endTime,
      appointmentType: avail.appointmentType,
      locationId: avail.locationId
    })) || [],
    education: docObj.education?.map(edu => ({
      degree: edu.degree,
      institute: edu.institute,
      startYear: edu.startYear,
      endYear: edu.endYear
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
  };

  res.status(200).json(new ApiResponse(200, transformedDoctor, "Doctor details fetched successfully"));
});

// Search doctors by name and/or speciality
const searchDoctors = asyncHandler(async (req, res) => {
  const { search, specialityId, city } = req.query;

  // Validate search query (minimum 3 characters)
  if (search && search.length < 3) {
    throw new ApiError(400, "Search query must be at least 3 characters");
  }

  const filter = { status: 'approved' }; // Only search approved doctors

  // Add name search filter (case-insensitive)
  if (search) {
    filter.name = { $regex: search, $options: 'i' };
  }

  // Add speciality filter
  if (specialityId) {
    filter.speciality = specialityId;
  }

  // Add city filter (case-insensitive)
  if (city) {
    filter['address.city'] = { $regex: city, $options: 'i' };
  }

  const doctors = await Doctor.find(filter)
    .populate('userId', 'whatsappnumber role -_id')
    .populate('speciality')
    .sort({ name: 1 });

  // Transform the response
  const transformedDoctors = doctors.map(doctor => {
    const docObj = doctor.toObject();

    let services = [];
    if (docObj.speciality && docObj.superSpeciality) {
      const matchingSuperSpec = docObj.speciality.super_specialities?.find(
        ss => ss.name.toLowerCase() === docObj.superSpeciality.toLowerCase()
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
      specialityId: docObj.speciality?._id || null,
      superSpeciality: docObj.superSpeciality,
      services: services,
      consultationTime: docObj.consultationTime,
      locations: docObj.locations?.map(loc => ({
        hospitalId: loc._id,
        name: loc.name,
        phone: loc.phone,
        coordinates: loc.coordinates
      })) || [],
      availability: docObj.availability?.map(avail => ({
        day: avail.day,
        startTime: avail.startTime,
        endTime: avail.endTime,
        appointmentType: avail.appointmentType,
        locationId: avail.locationId
      })) || [],
      education: docObj.education?.map(edu => ({
        degree: edu.degree,
        institute: edu.institute,
        startYear: edu.startYear,
        endYear: edu.endYear
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
    };
  });

  res.status(200).json(
    new ApiResponse(200, { count: transformedDoctors.length, doctors: transformedDoctors }, "Search results fetched successfully")
  );
});

// Get unique cities for lookup
const getCities = asyncHandler(async (req, res) => {
  const cities = await Doctor.distinct('address.city', { status: 'approved', 'address.city': { $ne: null, $ne: '' } });

  // Sort alphabetically
  const sortedCities = cities.sort((a, b) => a.localeCompare(b));

  res.status(200).json(
    new ApiResponse(200, { count: sortedCities.length, cities: sortedCities }, "Cities fetched successfully")
  );
});

// Admin-only: Create single doctor account + profile
const createDoctorByAdmin = asyncHandler(async (req, res) => {
  const { whatsappnumber, password, name, email, emergencyContact, address, pmdcRegistrationNumber, specialityId, superSpeciality, consultationTime, locations, availability, education, experience, image, status } = req.body;

  if (!whatsappnumber || !password || !name || !email || !pmdcRegistrationNumber) {
    throw new ApiError(400, "WhatsApp number, password, name, email, and PMDC number are required");
  }

  const existingUser = await User.findOne({ whatsappnumber });
  if (existingUser) throw new ApiError(400, "User with this WhatsApp number already exists");

  const existingDoctor = await Doctor.findOne({ email });
  if (existingDoctor) throw new ApiError(400, "Doctor with this email already exists");

  if (specialityId) {
    const specialityExists = await Speciality.findById(specialityId);
    if (!specialityExists) throw new ApiError(400, "Invalid speciality ID");

    if (superSpeciality) {
      const validSuperSpeciality = specialityExists.super_specialities.find(ss => ss.name.toLowerCase() === superSpeciality.toLowerCase());
      if (!validSuperSpeciality) throw new ApiError(400, `Invalid super speciality for ${specialityExists.speciality}`);
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await User.create({ whatsappnumber, password: hashedPassword, role: "doctor", isVerified: true });

  const newDoctor = await Doctor.create({
    userId: newUser._id, name, email, phone: emergencyContact || whatsappnumber, address, pmdcRegistrationNumber,
    speciality: specialityId, superSpeciality, consultationTime: consultationTime || 15,
    locations: locations || [], availability: availability || [], education: education || [],
    experience: experience || 0, image, status: status || 'approved'
  });

  res.status(201).json(new ApiResponse(201, { userId: newUser._id, doctorId: newDoctor._id, name: newDoctor.name, email: newDoctor.email, status: newDoctor.status }, "Doctor account created successfully"));
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
      const { whatsappnumber, password, name, email, emergencyContact, address, pmdcRegistrationNumber, specialityId, superSpeciality, consultationTime, locations, availability, education, experience, image, status } = doctor;

      if (!whatsappnumber || !password || !name || !email || !pmdcRegistrationNumber) throw new Error("Missing required fields");

      const existingUser = await User.findOne({ whatsappnumber });
      if (existingUser) throw new Error("WhatsApp number already exists");

      const existingDoctor = await Doctor.findOne({ email });
      if (existingDoctor) throw new Error("Email already exists");

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await User.create({ whatsappnumber, password: hashedPassword, role: "doctor", isVerified: true });

      const newDoctor = await Doctor.create({
        userId: newUser._id, name, email, phone: emergencyContact || whatsappnumber, address, pmdcRegistrationNumber,
        speciality: specialityId, superSpeciality, consultationTime: consultationTime || 15,
        locations: locations || [], availability: availability || [], education: education || [],
        experience: experience || 0, image, status: status || 'approved'
      });

      results.success.push({ index: i, userId: newUser._id, doctorId: newDoctor._id, name: newDoctor.name, email: newDoctor.email });
    } catch (error) {
      results.failed.push({ index: i, email: doctor.email, error: error.message });
    }
  }

  res.status(201).json(new ApiResponse(201, results, `Created ${results.success.length} doctors, ${results.failed.length} failed`));
});

module.exports = {
  updateStatus,
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
  bulkCreateDoctors
};