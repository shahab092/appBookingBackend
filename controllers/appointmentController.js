const Appointment = require("../models/Appointment");
const Doctor = require("../models/Docters");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { convertTo24Hour } = require("../utils/slotUtils");

// @desc    Book a new appointment
// @route   POST /api/appointments
// @access  Private (Patient only)
const bookAppointment = asyncHandler(async (req, res) => {
  const {
    doctorId,
    date,
    timeSlot,
    appointmentType,
    locationId,
    reason,
    patientName, // for guests
    patientPhone, // for guests
    patientEmail // optional for guests
  } = req.body;

  if (!doctorId || !date || !timeSlot || !appointmentType) {
    throw new ApiError(400, "Please provide all required fields (doctorId, date, timeSlot, appointmentType)");
  }

  // 1. Check if doctor exists and is approved
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new ApiError(404, "Doctor not found");
  if (doctor.status !== 'approved') throw new ApiError(400, "Doctor is not currently available for booking");

  // Prevent booking for past dates
  const searchDate = new Date(date).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  if (searchDate < today) {
    throw new ApiError(400, "Cannot book appointments for past dates.");
  }

  // 2. Validate session exists in doctor's availability
  const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
  const matchingSession = doctor.availability.find(s =>
    s.day === dayOfWeek &&
    s.appointmentType === appointmentType &&
    (!locationId || s.locationId?.toString() === locationId)
  );

  if (!matchingSession) {
    throw new ApiError(400, `Doctor does not have ${appointmentType} sessions on ${dayOfWeek}`);
  }

  // 3. Prevent double booking for the same doctor, date, and slot
  // Standardize the timeSlot to 24h format for both query and storage
  const timeSlot24h = convertTo24Hour(timeSlot);

  const existingAppointment = await Appointment.findOne({
    doctorId,
    date,
    timeSlot: timeSlot24h,
    status: { $in: ['booked', 'confirmed'] } // Also check for confirmed status
  });

  if (existingAppointment) {
    throw new ApiError(400, "This time slot is already booked");
  }

  // 4. Prepare patient data (Logged in or Guest)
  const appointmentData = {
    doctorId,
    date,
    timeSlot: timeSlot24h,
    appointmentType,
    locationName: matchingSession.locationName,
    reason,
    status: 'booked'
  };

  if (req.user) {
    // Registered user booking: Extract strictly from token
    appointmentData.patientId = req.user._id;
    appointmentData.patientPhone = req.user.whatsappnumber;
    appointmentData.patientName = req.user.name || patientName;
    appointmentData.patientEmail = req.user.email || patientEmail;
  } else {
    // Guest/Walk-in booking: Mandatory fields from body
    if (!patientPhone) {
      throw new ApiError(400, "Phone number is mandatory for guest booking");
    }
    if (!patientName) {
      throw new ApiError(400, "Patient name is required for guest booking");
    }
    appointmentData.patientName = patientName;
    appointmentData.patientPhone = patientPhone;
    appointmentData.patientEmail = patientEmail;
  }

  const appointment = await Appointment.create(appointmentData);

  res.status(201).json(
    new ApiResponse(201, appointment, "Appointment booked successfully")
  );
});

// @desc    Get logged in user's appointments
// @route   GET /api/appointments/my
// @access  Private
const getMyAppointments = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.user.role === 'patient') {
    filter.patientId = req.user._id;
  } else if (req.user.role === 'doctor') {
    // Find the doctor profile first
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) throw new ApiError(404, "Doctor profile not found");
    filter.doctorId = doctor._id;
  }

  const appointments = await Appointment.find(filter)
    .populate('doctorId', 'name speciality')
    .sort({ date: -1, timeSlot: -1 });

  res.status(200).json(
    new ApiResponse(200, appointments, "Appointments fetched successfully")
  );
});

// @desc    Update appointment status (Cancel/Complete)
// @route   PATCH /api/appointments/:id/status
// @access  Private
const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['booked', 'completed', 'cancelled'].includes(status)) {
    throw new ApiError(400, "Invalid status");
  }

  const appointment = await Appointment.findById(id);
  if (!appointment) throw new ApiError(404, "Appointment not found");

  // Check authorization
  // (In a real app, patients can only cancel, doctors can complete/cancel)

  appointment.status = status;
  await appointment.save();

  res.status(200).json(
    new ApiResponse(200, appointment, `Appointment status updated to ${status}`)
  );
});

module.exports = {
  bookAppointment,
  getMyAppointments,
  updateAppointmentStatus
};
