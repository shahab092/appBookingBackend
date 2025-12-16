const Appointment = require("../models/Appointment");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

// ================= BOOK APPOINTMENT =================
const bookAppointment = asyncHandler(async (req, res) => {
  const { patientId, doctorId, date, timeSlot, reason } = req.body;

  // Validate doctor & patient
  const doctor = await User.findById(doctorId);
  if (!doctor || !doctor.doctorProfile) {
    throw new ApiError(400, "Doctor not found");
  }

  const patient = await User.findById(patientId);
  if (!patient) {
    throw new ApiError(400, "Patient not found");
  }

  // Check if doctor is available for the requested slot
  const slotAvailable = doctor.doctorProfile.availableSlots.some(
    (slot) =>
      slot.isActive &&
      slot.startTime === timeSlot.startTime &&
      slot.endTime === timeSlot.endTime &&
      slot.dayOfWeek === new Date(date).getDay()
  );

  if (!slotAvailable) {
    throw new ApiError(400, "Doctor not available at this time");
  }

  // Optional: Check for conflicting appointments
  const conflict = await Appointment.findOne({
    doctor: doctorId,
    date,
    "timeSlot.startTime": timeSlot.startTime,
    "timeSlot.endTime": timeSlot.endTime,
    status: { $in: ["pending", "confirmed"] },
  });

  if (conflict) {
    throw new ApiError(400, "This time slot is already booked");
  }

  const appointment = await Appointment.create({
    patient: patientId,
    doctor: doctorId,
    date,
    timeSlot,
    reason,
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

  const appointments = await Appointment.find({ doctor: doctorId })
    .populate("patient", "firstName lastName patientProfile")
    .sort({ date: 1 });

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
