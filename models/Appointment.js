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
  },
  locationName: {
    type: String,
    required: false
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
