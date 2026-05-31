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

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
};

const isTruthyQuery = (value) =>
  value === true || value === "true" || value === "1";

const applyUpcomingFilter = (filter) => {
  const now = getPakistanDateTime();

  // Upcoming lists should show only confirmed appointments from today onward.
  filter.$expr = {
    $and: [
      { $eq: [{ $toLower: "$status" }, "confirmed"] },
      { $gte: ["$date", now.date] },
    ]
  };
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
    patientEmail, // optional for guests
  } = req.body;

  if (!doctorId || !date || !timeSlot || !appointmentType) {
    throw new ApiError(
      400,
      "Please provide all required fields (doctorId, date, timeSlot, appointmentType)",
    );
  }

  // 1. Check if doctor exists and is approved
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new ApiError(404, "Doctor not found");
  if (doctor.status !== "approved")
    throw new ApiError(400, "Doctor is not currently available for booking");

  // Prevent booking for past dates
  const searchDate = new Date(date).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  if (searchDate < today) {
    throw new ApiError(400, "Cannot book appointments for past dates.");
  }

  // 2. Validate session exists in doctor's availability
  const dayOfWeek = new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
  });
  const matchingSession = doctor.availability.find(
    (s) =>
      s.day === dayOfWeek &&
      s.appointmentType === appointmentType &&
      (!locationId || s.locationId?.toString() === locationId),
  );

  if (!matchingSession) {
    throw new ApiError(
      400,
      `Doctor does not have ${appointmentType} sessions on ${dayOfWeek}`,
    );
  }

  // 3. Prepare patient data (Logged in or Guest)
  const timeSlot24h = convertTo24Hour(timeSlot);
  const appointmentData = {
    doctorId,
    date,
    timeSlot: timeSlot24h,
    appointmentType,
    locationName: matchingSession.locationName,
    reason,
    status: "pending", // Create as pending lock (lowercase)
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5-minute lock
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

  try {
    const appointment = await Appointment.create(appointmentData);

    // Populate doctor info before sending response
    await appointment.populate("doctorId", "name speciality image");

    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          appointment,
          "Appointment initiated successfully. Please complete payment within 5 minutes.",
        ),
      );
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(
        400,
        "This slot was just taken or is temporarily reserved. Please choose another slot.",
      );
    }
    throw error;
  }
});

// @desc    Get logged in user's appointments
// @route   GET /api/appointments/my
// @access  Private
const getMyAppointments = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.user.role === "patient") {
    filter.patientId = req.user._id;
  } else if (req.user.role === "doctor") {
    // Find the doctor profile first
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) throw new ApiError(404, "Doctor profile not found");
    filter.doctorId = doctor._id;
  }

  const upcomingOnly =
    isTruthyQuery(req.query.upcoming) || isTruthyQuery(req.query.upcomming);

  if (upcomingOnly) {
    applyUpcomingFilter(filter);
  }

  const appointments = await Appointment.find(filter)
    .populate("doctorId", "name speciality")
    .sort({ date: -1, timeSlot: -1 });

  // Normalize status in response
  const formattedAppointments = appointments.map((appointment) => ({
    ...appointment.toObject(),
    status: appointment.status?.toLowerCase(),
  }));

  res
    .status(200)
    .json(
      new ApiResponse(200, formattedAppointments, "Appointments fetched successfully"),
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
    .populate("doctorId", "name speciality")
    .sort(upcomingOnly ? { date: 1, timeSlot: 1 } : { date: -1, timeSlot: -1 });

  // Normalize status in response
  const formattedAppointments = appointments.map((appointment) => ({
    ...appointment.toObject(),
    status: appointment.status?.toLowerCase(),
  }));

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        formattedAppointments,
        "Patient appointments fetched successfully",
      ),
    );
});

// @desc    Get logged in doctor's appointments
// @route   GET /api/appointments/doctor
// @access  Private
const getLoggedInDoctorAppointments = asyncHandler(async (req, res) => {
  if (req.user.role !== "doctor") {
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
    applyUpcomingFilter(filter);
  }

  const appointments = await Appointment.find(filter)
    .populate("patientId", "name email whatsappnumber")
    .sort(upcomingOnly ? { date: 1, timeSlot: 1 } : { date: -1, timeSlot: -1 });

  const formattedAppointments = appointments.map((appointment) => ({
    ...appointment.toObject(),
    status: appointment.status?.toLowerCase(),
    patientName: appointment.patientId?.name || appointment.patientName,
    patientEmail: appointment.patientId?.email || appointment.patientEmail,
    patientPhone:
      appointment.patientId?.whatsappnumber || appointment.patientPhone,
    isGuest: !appointment.patientId,
  }));

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        formattedAppointments,
        "Doctor appointments fetched successfully",
      ),
    );
});

// @desc    Update appointment status (Cancel/Complete)
// @route   PATCH /api/appointments/:id/status
// @access  Private
const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let { status } = req.body;

  if (!status) {
    throw new ApiError(400, "Status is required");
  }

  // Normalize status to lowercase
  status = status.toLowerCase();

  if (!["booked", "completed", "cancelled"].includes(status)) {
    throw new ApiError(400, "Invalid status. Allowed values: booked, completed, cancelled");
  }

  const appointment = await Appointment.findById(id);
  if (!appointment) throw new ApiError(404, "Appointment not found");

  // Check authorization
  // (In a real app, patients can only cancel, doctors can complete/cancel)
  if (req.user.role === "patient" && status !== "cancelled") {
    throw new ApiError(403, "Patients can only cancel appointments");
  }

  appointment.status = status;
  await appointment.save();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        appointment,
        `Appointment status updated to ${status}`,
      ),
    );
});

// @desc    Get all appointments for a specific doctor
// @route   GET /api/appointments/doctor/:doctorId
// @access  Private (Admin or the Doctor themselves)
const getDoctorAppointments = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;

  // Optional: Add authorization check
  if (req.user.role !== 'admin') {
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor || doctor._id.toString() !== doctorId) {
      throw new ApiError(403, "You don't have permission to view these appointments");
    }
  }

  const filter = { doctorId, isDeleted: false };
  const upcomingOnly =
    isTruthyQuery(req.query.upcoming) || isTruthyQuery(req.query.upcomming);

  if (upcomingOnly) {
    applyUpcomingFilter(filter);
  }

  const appointments = await Appointment.find(filter)
    .populate("patientId", "name email whatsappnumber")
    .sort(upcomingOnly ? { date: 1, timeSlot: 1 } : { date: -1, timeSlot: -1 });

  const formattedAppointments = appointments.map((appointment) => ({
    ...appointment.toObject(),
    status: appointment.status?.toLowerCase(),
    patientName: appointment.patientId?.name || appointment.patientName,
    patientEmail: appointment.patientId?.email || appointment.patientEmail,
    patientPhone:
      appointment.patientId?.whatsappnumber || appointment.patientPhone,
    isGuest: !appointment.patientId,
  }));

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        formattedAppointments,
        "Doctor appointments fetched successfully",
      ),
    );
});

// @desc    Get all appointments (Admin only)
// @route   GET /api/appointments/all
// @access  Private (Admin only)
const getAllAppointments = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    throw new ApiError(403, "Access denied. Admin only.");
  }

  const filter = { isDeleted: false };
  const upcomingOnly =
    isTruthyQuery(req.query.upcoming) || isTruthyQuery(req.query.upcomming);

  if (upcomingOnly) {
    applyUpcomingFilter(filter);
  }

  const appointments = await Appointment.find(filter)
    .populate("doctorId", "name speciality")
    .populate("patientId", "name email whatsappnumber")
    .sort(upcomingOnly ? { date: 1, timeSlot: 1 } : { date: -1, timeSlot: -1 });

  const formattedAppointments = appointments.map((appointment) => ({
    ...appointment.toObject(),
    status: appointment.status?.toLowerCase(),
    patientName: appointment.patientId?.name || appointment.patientName,
    patientEmail: appointment.patientId?.email || appointment.patientEmail,
    patientPhone: appointment.patientId?.whatsappnumber || appointment.patientPhone,
    doctorName: appointment.doctorId?.name,
    doctorSpeciality: appointment.doctorId?.speciality,
    isGuest: !appointment.patientId,
  }));

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        formattedAppointments,
        "All appointments fetched successfully",
      ),
    );
});

// @desc    Get appointment by ID
// @route   GET /api/appointments/:id
// @access  Private
const getAppointmentById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const appointment = await Appointment.findById(id)
    .populate("doctorId", "name speciality image")
    .populate("patientId", "name email whatsappnumber");

  if (!appointment) {
    throw new ApiError(404, "Appointment not found");
  }

  // Check authorization
  if (req.user.role !== 'admin') {
    if (req.user.role === 'patient' && appointment.patientId?._id.toString() !== req.user._id) {
      throw new ApiError(403, "You don't have permission to view this appointment");
    }
    
    if (req.user.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: req.user._id });
      if (!doctor || appointment.doctorId._id.toString() !== doctor._id.toString()) {
        throw new ApiError(403, "You don't have permission to view this appointment");
      }
    }
  }

  const formattedAppointment = {
    ...appointment.toObject(),
    status: appointment.status?.toLowerCase(),
    patientName: appointment.patientId?.name || appointment.patientName,
    patientEmail: appointment.patientId?.email || appointment.patientEmail,
    patientPhone: appointment.patientId?.whatsappnumber || appointment.patientPhone,
    isGuest: !appointment.patientId,
  };

  res
    .status(200)
    .json(
      new ApiResponse(200, formattedAppointment, "Appointment fetched successfully"),
    );
});

// @desc    Cancel appointment
// @route   PATCH /api/appointments/:id/cancel
// @access  Private
const cancelAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const appointment = await Appointment.findById(id);
  if (!appointment) {
    throw new ApiError(404, "Appointment not found");
  }

  // Check if appointment can be cancelled (e.g., not in past, not already completed)
  const appointmentDate = new Date(appointment.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (appointmentDate < today) {
    throw new ApiError(400, "Cannot cancel past appointments");
  }

  const currentStatus = appointment.status?.toLowerCase();
  if (currentStatus === 'completed') {
    throw new ApiError(400, "Cannot cancel completed appointments");
  }

  if (currentStatus === 'cancelled') {
    throw new ApiError(400, "Appointment is already cancelled");
  }

  // Check authorization
  let isAuthorized = false;
  
  if (req.user.role === 'admin') {
    isAuthorized = true;
  } else if (req.user.role === 'patient' && appointment.patientId?.toString() === req.user._id) {
    isAuthorized = true;
  } else if (req.user.role === 'doctor') {
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (doctor && appointment.doctorId.toString() === doctor._id.toString()) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    throw new ApiError(403, "You don't have permission to cancel this appointment");
  }

  appointment.status = 'cancelled';
  appointment.cancelledAt = new Date();
  appointment.cancellationReason = reason || 'No reason provided';
  await appointment.save();

  res
    .status(200)
    .json(
      new ApiResponse(200, appointment, "Appointment cancelled successfully"),
    );
});

module.exports = {
  bookAppointment,
  getMyAppointments,
  getPatientAppointments,
  getLoggedInDoctorAppointments,
  updateAppointmentStatus,
  getDoctorAppointments,
  getAllAppointments,
  getAppointmentById,
  cancelAppointment,
};
