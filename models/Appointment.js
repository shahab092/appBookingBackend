// models/Appointment.js
const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor", // Points to the profile collection
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Points to User model
    required: false // Optional for guest booking
  },
  patientPhone: {
    type: String,
    required: true, // Required for both guest and registered (sync if logged in)
    trim: true
  },
  patientName: {
    type: String,
    required: true // Required for guests
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
    enum: ["booked", "confirmed", "completed", "cancelled"],
    default: "booked"
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "failed"],
    default: "pending"
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
