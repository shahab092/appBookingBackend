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

  const appointments = await Appointment.find({ patient: patientId })
    .populate("doctor", "firstName lastName doctorProfile")
    .sort({ date: 1 });

  res.json(new ApiResponse(true, "Patient appointments fetched", appointments));
});

// ================= GET DOCTOR APPOINTMENTS =================
const getDoctorAppointments = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;

  // Check if doctor exists and is actually a doctor
  const doctor = await User.findOne({
    _id: doctorId,
    role: "doctor",
    status: { $in: ["active", "approved"] }
  });

  if (!doctor) {
    throw new ApiError(404, "Doctor not found");
  }

  const appointments = await Appointment.find({ 
    doctorId: doctorId,
    isDeleted: false 
  })
    .populate("patientId", "firstName lastName email profilePicture")
    .sort({ date: 1, timeSlot: 1 });

  res.json(new ApiResponse(true, "Doctor appointments fetched", appointments));
});

// ================= UPDATE APPOINTMENT STATUS =================
const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const { status } = req.body;

  const validStatuses = ["pending", "confirmed", "waiting_room", "cancelled", "completed"];
  if (!validStatuses.includes(status)) {
    throw new ApiError(400, `Invalid status. Valid statuses: ${validStatuses.join(", ")}`);
  }

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new ApiError(404, "Appointment not found");
  }

  appointment.status = status;
  await appointment.save();

  res.json(new ApiResponse(true, "Appointment status updated", appointment));
});

module.exports = {
  bookAppointment,
  getPatientAppointments,
  getDoctorAppointments,
  updateAppointmentStatus
};
