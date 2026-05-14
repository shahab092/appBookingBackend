const Appointment = require("../models/Appointment");
const Doctor = require("../models/Docters");
const User = require("../models/User");
const Patient = require("../models/Patient");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { convertTo24Hour } = require("../utils/slotUtils");

const getPakistanDateTime = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
};

const isTruthyQuery = (value) =>
  value === true || value === "true" || value === "1";

const applyUpcomingFilter = (filter) => {
  const now = getPakistanDateTime();

  filter.status = "confirmed";
  filter.$or = [
    { date: { $gt: now.date } },
    { date: now.date, timeSlot: { $gte: now.time } },
  ];
};

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

    // Fetch Name from Patient Profile if not available in User
    let fetchedName = req.user.name;
    if (!fetchedName) {
      const patientProfile = await Patient.findOne({ userId: req.user._id });
      if (patientProfile) {
        fetchedName = patientProfile.name;
      }
    }

    appointmentData.patientName = fetchedName || patientName;
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

// @desc    Get logged in patient's appointments
// @route   GET /api/appointments/patient
// @access  Private
const getPatientAppointments = asyncHandler(async (req, res) => {
  const filter = {
    patientId: req.user._id,
    isDeleted: false,
  };

  const upcomingOnly =
    isTruthyQuery(req.query.upcoming) || isTruthyQuery(req.query.upcomming);

  if (upcomingOnly) {
    applyUpcomingFilter(filter);
  }

  const appointments = await Appointment.find(filter)
    .populate('doctorId', 'name speciality')
    .sort(upcomingOnly ? { date: 1, timeSlot: 1 } : { date: -1, timeSlot: -1 });

  res.status(200).json(
    new ApiResponse(200, appointments, "Patient appointments fetched successfully")
  );
});

// @desc    Get logged in doctor's appointments
// @route   GET /api/appointments/doctor
// @access  Private
// @desc    Get logged in doctor's appointments
// @route   GET /api/appointments/doctor
// @access  Private
const getLoggedInDoctorAppointments = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') {
    throw new ApiError(403, "Access denied. Doctors only.");
  }

  const doctor = await Doctor.findOne({ userId: req.user._id });
  if (!doctor) throw new ApiError(404, "Doctor profile not found");

  const filter = {
    doctorId: doctor._id,
    isDeleted: false,
  };

  const upcomingOnly =
    isTruthyQuery(req.query.upcoming) || isTruthyQuery(req.query.upcomming);

  if (upcomingOnly) {
    // FIX: Compare string dates since your DB stores dates as strings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().split('T')[0]; // "2026-05-13"
    
    filter.date = { $gte: todayString };
    
    // Keep original function call
    applyUpcomingFilter(filter);
  }

  const appointments = await Appointment.find(filter)
    .populate('patientId', 'name email whatsappnumber')
    .sort(
      upcomingOnly
        ? { date: 1, timeSlot: 1 }
        : { date: -1, timeSlot: -1 }
    );

  const formattedAppointments = appointments.map((appointment) => ({
    ...appointment.toObject(),

    patientName:
      appointment.patientId?.name || appointment.patientName,

    patientEmail:
      appointment.patientId?.email || appointment.patientEmail,

    patientPhone:
      appointment.patientId?.whatsappnumber || appointment.patientPhone,

    isGuest: !appointment.patientId,
  }));

  res.status(200).json(
    new ApiResponse(
      200,
<<<<<<< HEAD
      appointmentsWithDetails,
      "Patient appointments fetched",
    ),
=======
      formattedAppointments,
      "Doctor appointments fetched successfully"
    )
>>>>>>> 71b9dc04c6a0e7f8c4396e2330e93bdc0be13131
  );
});

// @desc    Update appointment status (Cancel/Complete)
// @route   PATCH /api/appointments/:id/status
// @access  Private
const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

<<<<<<< HEAD
  const validStatuses = ["booked", "completed", "cancelled"];
  if (!validStatuses.includes(status)) {
    throw new ApiError(
      400,
      `Invalid status. Valid statuses: ${validStatuses.join(", ")}`,
    );
=======
  if (!['booked', 'completed', 'cancelled'].includes(status)) {
    throw new ApiError(400, "Invalid status");
>>>>>>> 71b9dc04c6a0e7f8c4396e2330e93bdc0be13131
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

// @desc    Get all appointments for a specific doctor
// @route   GET /api/appointments/doctor/:doctorId
// @access  Private (Admin or the Doctor themselves)
// @desc    Get all appointments for a specific doctor
// @route   GET /api/appointments/doctor/:doctorId
// @access  Private (Admin or the Doctor themselves)
const getDoctorAppointments = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;

  const appointments = await Appointment.find({ doctorId })
    .populate('patientId', 'name email whatsappnumber')
    .sort({ date: -1, timeSlot: -1 });

  const formattedAppointments = appointments.map((appointment) => ({
    ...appointment.toObject(),

    patientName:
      appointment.patientId?.name || appointment.patientName,

    patientEmail:
      appointment.patientId?.email || appointment.patientEmail,

    patientPhone:
      appointment.patientId?.whatsappnumber || appointment.patientPhone,

    isGuest: !appointment.patientId,
  }));

  res.status(200).json(
    new ApiResponse(
      200,
      formattedAppointments,
      "Doctor appointments fetched successfully"
    )
  );
});

module.exports = {
  bookAppointment,
  getMyAppointments,
  getPatientAppointments,
  getLoggedInDoctorAppointments,
  updateAppointmentStatus,
  getDoctorAppointments
};
