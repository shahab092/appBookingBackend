const Appointment = require("../models/Appointment");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

// ================= BOOK APPOINTMENT =================
const bookAppointment = asyncHandler(async (req, res) => {
  const { patientId, doctorId, date, timeSlot, reason, department } = req.body;

  // Validate required fields
  if (!patientId || !doctorId || !date || !timeSlot || !department) {
    throw new ApiError(400, "Missing required fields");
  }

  // Validate doctor & patient
  const doctor = await User.findById(doctorId);
  if (!doctor || !doctor.doctorProfile) {
    throw new ApiError(400, "Doctor not found");
  }

  const patient = await User.findById(patientId);
  if (!patient) {
    throw new ApiError(400, "Patient not found");
  }

  // Get department from doctor if not provided
  const appointmentDepartment = department || doctor.doctorProfile.specialization;

  // Create appointment with CORRECT field names
  const appointment = await Appointment.create({
    patientId,        // ✅ Correct: patientId (not patient)
    patientName: patient.fullName || `${patient.firstName} ${patient.lastName}`,
    patientEmail: patient.email,
    doctorId,         // ✅ Correct: doctorId (not doctor)
    department: appointmentDepartment,
    date,
    timeSlot,
    reason: reason || "General consultation"
  });

  res.status(201).json(new ApiResponse(true, "Appointment booked successfully", appointment));
});
// ================= GET PATIENT APPOINTMENTS =================
const getPatientAppointments = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const { status, date, upcomingOnly, pastOnly } = req.query;

  // Build filter - patientId matches your schema field name
  const filter = { 
    patientId: patientId, 
    isDeleted: false 
  };

  // Filter by status if provided
  if (status) {
    filter.status = status;
  }

  // Filter by date if provided
  if (date) {
    filter.date = date;
  }

  // Filter for upcoming appointments (today and future)
  if (upcomingOnly === 'true') {
    const today = new Date().toISOString().split('T')[0];
    filter.date = { $gte: today };
    filter.status = { $in: ["booked"] }; // Only show booked upcoming appointments
  }

  // Filter for past appointments
  if (pastOnly === 'true') {
    const today = new Date().toISOString().split('T')[0];
    filter.date = { $lt: today };
  }

  const appointments = await Appointment.find(filter)
    .populate({
      path: "doctorId",
      select: "firstName lastName email phoneNumber profilePicture doctorProfile role",
      match: { 
        role: "doctor",
        isActive: true,
        status: { $in: ["active", "approved"] }
      }
    })
    .populate({
      path: "patientId",
      select: "firstName lastName email phoneNumber profilePicture patientProfile role"
    })
    .sort({ date: 1, timeSlot: 1 }); // Sort chronologically

  // Filter out appointments where doctor might be deactivated or not found
  const validAppointments = appointments.filter(app => app.doctorId !== null);

  res.json(new ApiResponse(true, "Patient appointments fetched", validAppointments));
});

// ================= GET DOCTOR APPOINTMENTS =================
const getDoctorAppointments = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { status, date } = req.query;

  // Verify doctor exists and is actually a doctor
  const doctor = await User.findOne({
    _id: doctorId,
    role: "doctor",
    isActive: true
  });

  if (!doctor) {
    throw new ApiError(404, "Doctor not found or inactive");
  }

  // Build filter - doctorId matches your schema field name
  const filter = { 
    doctorId: doctorId, 
    isDeleted: false 
  };

  if (status) {
    filter.status = status;
  }

  if (date) {
    filter.date = date;
  }

  const appointments = await Appointment.find(filter)
    .populate({
      path: "patientId",
      select: "firstName lastName email phoneNumber profilePicture patientProfile"
    })
    .sort({ date: 1, timeSlot: 1 }); // Show earliest appointments first

  res.json(new ApiResponse(true, "Doctor appointments fetched", appointments));
});s

// ================= UPDATE APPOINTMENT STATUS =================
const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const { status } = req.body;

  // Your Appointment schema enum values
  const validStatuses = ["booked", "completed", "cancelled"];
  if (!validStatuses.includes(status)) {
    throw new ApiError(400, `Invalid status. Valid statuses: ${validStatuses.join(", ")}`);
  }

  const appointment = await Appointment.findOne({
    _id: appointmentId,
    isDeleted: false
  });

  if (!appointment) {
    throw new ApiError(404, "Appointment not found");
  }

  // Update status
  appointment.status = status;
  
  // Mark as deleted if cancelled (soft delete)
  if (status === "cancelled") {
    appointment.isDeleted = true;
    appointment.deletedAt = new Date();
  }
  
  await appointment.save();

  res.json(new ApiResponse(true, "Appointment status updated", appointment));
});

module.exports = {
  bookAppointment,
  getPatientAppointments,
  getDoctorAppointments,
  updateAppointmentStatus
};
