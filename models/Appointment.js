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
    required: function () { return !this.patientId; }, // Required for guest, optional if logged in (linked via patientId)
    trim: true
  },
  patientName: {
    type: String,
    required: function () { return !this.patientId; } // Required for guests, optional if logged in
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
    enum: ["pending", "booked", "confirmed", "inprogress", "completed", "cancelled"],
    default: "booked"
  },
  expiresAt: {
    type: Date,
    default: null
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

// Professional Concurrency Control:
// Ensure only one active appointment (pending/booked/confirmed/inprogress) exists for a doctor-date-timeslot combo.
appointmentSchema.index(
  { doctorId: 1, date: 1, timeSlot: 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      status: { $in: ["pending", "booked", "confirmed", "inprogress"] },
      isDeleted: false
    } 
  }
);

// TTL Index for Soft Locks:
// MongoDB will automatically delete documents when expiresAt is reached.
appointmentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Optimize for role-based upcoming appointment queries
appointmentSchema.index({ doctorId: 1, date: 1, status: 1 });
appointmentSchema.index({ patientId: 1, date: 1, status: 1 });
// For general sorting and date-based filtering
appointmentSchema.index({ date: 1, timeSlot: 1 });

module.exports = mongoose.model("Appointment", appointmentSchema);
