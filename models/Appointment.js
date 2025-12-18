// models/Appointment.js
const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  department: {
    type: String,
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  patientName: {
    type: String,
    required: false
  },
  patientEmail: {
    type: String,
    required: false
  },
  date: {
    type: String,
    required: true
  },
  timeSlot: {
    type: String,
    required: true,
    enum: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00']
  },
  appointmentType: {
    type: String,
    enum: ["online", "inclinic"], // new field
    required: true,
    default: "inclinic"
  },
  reason: {
    type: String,
    required: false
  },
  status: {
    type: String,
    enum: ["booked", "completed", "cancelled"],
    default: "booked"
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model("Appointment", appointmentSchema);
