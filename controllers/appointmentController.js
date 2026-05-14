const Appointment = require("../models/Appointment");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { createNotification } = require("../utils/notificationUtils");

// ================= BOOK APPOINTMENT =================
const bookAppointment = asyncHandler(async (req, res) => {
  const {
    patientId,
    doctorId,
    date,
    timeSlot,
    reason,
    department,
    appointmentType,
  } = req.body;

  // Validate required fields
  if (
    !patientId ||
    !doctorId ||
    !date ||
    !timeSlot ||
    !department ||
    !appointmentType
  ) {
    throw new ApiError(400, "Missing required fields");
  }

  // Validate appointmentType
  const validTypes = ["online", "inclinic"];
  if (!validTypes.includes(appointmentType)) {
    throw new ApiError(
      400,
      `Invalid appointmentType. Valid types: ${validTypes.join(", ")}`,
    );
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
  const appointmentDepartment =
    department || doctor.doctorProfile.specialization;

  // Create appointment
  const appointment = await Appointment.create({
    patientId,
    patientName: patient.fullName || `${patient.firstName} ${patient.lastName}`,
    patientEmail: patient.email,
    doctorId,
    department: appointmentDepartment,
    date,
    timeSlot,
    reason: reason || "General consultation",
    appointmentType, // <-- new field
  });

  const io = req.app.get("io");
  await createNotification(io, doctorId, {
    title: "New Appointment",
    message: `New ${appointmentType} appointment booked by ${
      patient.fullName || patient.firstName
    } on ${date} at ${timeSlot}`,
    type: "info",
    link: `/doctor/dashboard`,
  });
  res
    .status(201)
    .json(new ApiResponse(201, appointment, "Appointment booked successfully"));
});

// ================= GET PATIENT APPOINTMENTS =================
const getPatientAppointments = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const { status, date, upcomingOnly, pastOnly, appointmentType } = req.query;

  // Verify patient exists
  const patientExists = await User.exists({
    _id: patientId,
    role: "patient",
    isActive: true,
  });
  if (!patientExists) throw new ApiError(404, "Patient not found");

  // Build filter
  const filter = { patientId, isDeleted: false };
  if (status) filter.status = status;
  if (date) filter.date = date;
  if (appointmentType) filter.appointmentType = appointmentType;

  const isUpcoming = upcomingOnly === "true";
  const today = new Date().toISOString().split("T")[0];

  if (isUpcoming) {
    filter.date = { $gte: today };
    filter.status = { $in: ["booked", "confirmed"] };
  }
  
  if (pastOnly === "true") {
    filter.date = { $lt: today };
  }

  const appointments = await Appointment.find(filter)
    .populate({
      path: "doctorId",
      select:
        "firstName lastName email phoneNumber profilePicture doctorProfile",
      match: {
        role: "doctor",
        isActive: true,
      },
    })
    .sort(isUpcoming ? { date: 1, timeSlot: 1 } : { date: -1, timeSlot: -1 });

  const validAppointments = appointments.filter((app) => app.doctorId !== null);

  const patient = await User.findById(patientId).select(
    "firstName lastName email phoneNumber profilePicture",
  );

  const appointmentsWithDetails = validAppointments.map((appointment) => {
    const appointmentObj = appointment.toObject();
    if (patient) {
      appointmentObj.patientInfo = {
        id: patient._id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        fullName: patient.fullName,
        email: patient.email,
        phoneNumber: patient.phoneNumber,
        profilePicture: patient.profilePicture,
      };
    }
    return appointmentObj;
  });

  res.json(
    new ApiResponse(
      200,
      appointmentsWithDetails,
      "Patient appointments fetched",
    ),
  );
});

// ================= GET DOCTOR APPOINTMENTS =================
const getDoctorAppointments = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { status, date, appointmentType } = req.query;

  const doctor = await User.findOne({
    _id: doctorId,
    role: "doctor",
    isActive: true,
  });
  if (!doctor) throw new ApiError(404, "Doctor not found or inactive");

  const filter = { doctorId, isDeleted: false };
  if (status) filter.status = status;
  if (date) filter.date = date;
  if (appointmentType) filter.appointmentType = appointmentType;

  const appointments = await Appointment.find(filter)
    .populate({
      path: "patientId",
      select:
        "firstName lastName email phoneNumber profilePicture patientProfile",
    })
    .sort({ date: 1, timeSlot: 1 });

  res.json(new ApiResponse(200, appointments, "Doctor appointments fetched"));
});

// ================= UPDATE APPOINTMENT STATUS =================
const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const { status } = req.body;

  const validStatuses = ["booked", "completed", "cancelled"];
  if (!validStatuses.includes(status)) {
    throw new ApiError(
      400,
      `Invalid status. Valid statuses: ${validStatuses.join(", ")}`,
    );
  }

  const appointment = await Appointment.findOne({
    _id: appointmentId,
    isDeleted: false,
  });
  if (!appointment) throw new ApiError(404, "Appointment not found");

  appointment.status = status;

  if (status === "cancelled") {
    appointment.isDeleted = true;
    appointment.deletedAt = new Date();
  }

  await appointment.save();
  const io = req.app.get("io");
  await createNotification(io, appointment.patientId, {
    title: `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    message: `Your appointment on ${appointment.date} at ${appointment.timeSlot} has been ${status}`,
    type: status === "cancelled" ? "warning" : "success",
    link: `/patient/dashboard`,
  });

  res.json(new ApiResponse(200, appointment, "Appointment status updated"));
});

module.exports = {
  bookAppointment,
  getPatientAppointments,
  getDoctorAppointments,
  updateAppointmentStatus,
};
