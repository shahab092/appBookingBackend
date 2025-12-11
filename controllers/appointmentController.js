// controllers/appointmentController.js
const Appointment = require("../models/Appointment");
const User = require("../models/User"); // Import User model

// ===============================
// CREATE APPOINTMENT
// ===============================
exports.createAppointment = async (req, res, next) => {
  try {
    const { doctorId, date, timeSlot, reason } = req.body;

    // Find the doctor to get their name and department
    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({
        success: false,
        message: "Doctor not found"
      });
    }

    // Extract doctor details from the found user object
    const doctorName = doctor.name;
    // Assuming department is stored in a field like 'specialty' on the User model for doctors
    const department = doctor.specialty; // Or another field where department is stored

    if (!doctorId || !department || !date || !timeSlot) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // Check if slot already booked for this doctor on this date
    const existingAppointment = await Appointment.findOne({
      doctorId,
      date,
      timeSlot,
      status: { $ne: 'cancelled' }
    });

    if (existingAppointment) {
      return res.status(400).json({
        success: false,
        message: "Time slot already booked"
      });
    }

    // Extract userId, patientName, patientEmail from authenticated user (req.user)
    const userId = req.user._id;
    const patientName = req.user.name;
    const patientEmail = req.user.email;

    const appointment = await Appointment.create({
      doctorId,
      patientId: userId, // Corrected from userId to match schema
      doctorName,
      department,
      patientName,
      patientEmail,
      date,
      timeSlot,
      reason,
      status: 'booked'
    });

    return res.status(201).json({
      success: true,
      message: "Appointment booked successfully",
      data: appointment
    });

  } catch (error) {
    next(error);
  }
};


// ===============================
// GET ALL APPOINTMENTS
// ===============================
exports.getAllAppointments = async (req, res, next) => {
  try {
    const appointments = await Appointment.find()
      .populate("doctorId", "name email specialty")
      .populate("patientId", "name email googleId");

    return res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments
    });

  } catch (error) {
    next(error);
  }
};


// ===============================
// GET SINGLE APPOINTMENT
// ===============================
exports.getAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate("doctorId", "name email specialty")
      .populate("patientId", "name email googleId");

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: appointment
    });

  } catch (error) {
    next(error);
  }
};


// ===============================
// UPDATE APPOINTMENT
// ===============================
exports.updateAppointment = async (req, res, next) => {
  try {
    const updated = await Appointment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Appointment updated successfully",
      data: updated
    });

  } catch (error) {
    next(error);
  }
};


// ===============================
// DELETE APPOINTMENT
// ===============================
exports.deleteAppointment = async (req, res, next) => {
  try {
    const deleted = await Appointment.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Appointment deleted successfully"
    });

  } catch (error) {
    next(error);
  }
};


// ===============================
// GET AVAILABLE TIME SLOTS
// ===============================
exports.getAvailableSlots = async (req, res, next) => {
  try {
    const { doctorId, date } = req.query;

    if (!doctorId || !date) {
      return res.status(400).json({
        success: false,
        message: "doctorId and date required"
      });
    }

    const allSlots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];

    const bookedSlots = await Appointment.find({
      doctorId,
      date,
      status: { $ne: 'cancelled' }
    }).select('timeSlot');

    const bookedTimes = bookedSlots.map(apt => apt.timeSlot);
    const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));

    return res.status(200).json({
      success: true,
      availableSlots,
      bookedSlots: bookedTimes
    });

  } catch (error) {
    next(error);
  }
};
