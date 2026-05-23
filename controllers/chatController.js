const Chat = require("../models/Chat");
const Message = require("../models/Message");
const Doctor = require("../models/Docters");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { uploadToR2 } = require("../utils/s3Storage");

// Helper to determine the query identity of the user
const getUserIdentity = async (user) => {
  if (user.role === "doctor") {
    const doctor = await Doctor.findOne({ userId: user._id });
    if (!doctor) throw new ApiError(404, "Doctor profile not found");
    return { type: "Doctor", id: doctor._id };
  } else {
    // Patients or Admins
    return { type: "User", id: user._id };
  }
};

// @desc    Initialize or fetch a chat for a specific appointment
// @route   POST /api/chat/init
// @access  Private
const initChat = asyncHandler(async (req, res) => {
  const { appointmentId: passedAppointmentId } = req.body;
  if (!passedAppointmentId) throw new ApiError(400, "appointmentId is required");

  const Appointment    = require("../models/Appointment");
  const Consultation   = require("../models/Consultation");

  const identity = await getUserIdentity(req.user);

  // ── Step 1: Find the caller's active (IN_PROGRESS) consultation.
  //
  // The frontend may pass a stale or wrong appointmentId — especially when
  // doctor and patient navigate from different parts of the app.  Instead of
  // trusting the passed ID, we look up the active consultation for this user.
  // Both doctor and patient share the SAME consultation document, so they will
  // always derive the same appointmentId and land in the same chat room.
  // This is a backend-only fix that works with any APK version.
  let activeConsultation = null;
  if (identity.type === "Doctor") {
    activeConsultation = await Consultation.findOne({
      doctorId: identity.id,
      status:   "IN_PROGRESS",
    });
  } else {
    activeConsultation = await Consultation.findOne({
      patientId: req.user._id,
      status:    "IN_PROGRESS",
    });
  }

  // Use the active consultation's appointmentId when available.
  // Fall back to the passed value only if no active consultation exists.
  const effectiveAppointmentId = activeConsultation
    ? activeConsultation.appointmentId.toString()
    : passedAppointmentId;

  console.log(
    `[initChat] ${identity.type} ${identity.id}` +
    ` | passed: ${passedAppointmentId}` +
    ` | effective: ${effectiveAppointmentId}` +
    ` | consultationId: ${activeConsultation?._id || "none (fallback)"}`
  );

  // ── Step 2: Fetch appointment and verify the caller is a participant
  const appointment = await Appointment.findById(effectiveAppointmentId);
  if (!appointment) throw new ApiError(404, "Appointment not found");

  const isParticipant =
    (identity.type === "Doctor" &&
      appointment.doctorId.toString() === identity.id.toString()) ||
    (identity.type === "User" &&
      appointment.patientId &&
      appointment.patientId.toString() === identity.id.toString());

  if (!isParticipant) {
    console.warn(
      `[initChat] REJECTED: ${identity.type} ${identity.id}` +
      ` is not a participant of appointment ${effectiveAppointmentId}`
    );
    throw new ApiError(403, "You are not authorized to join the chat for this appointment");
  }

  // ── Step 3: Atomic find-or-create (prevents race-condition duplicates)
  const rawChat = await Chat.findOneAndUpdate(
    { appointmentId: effectiveAppointmentId },
    {
      $setOnInsert: {
        appointmentId: effectiveAppointmentId,
        doctorId:      appointment.doctorId,
        patientId:     appointment.patientId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const chat = await Chat.findById(rawChat._id)
    .populate("doctorId", "name image speciality")
    .populate("patientId", "name email image");

  console.log(`[initChat] ✅ chatId: ${chat._id} for appointmentId: ${effectiveAppointmentId}`);

  res.status(200).json(new ApiResponse(200, chat, "Chat initialized"));
});


// @desc    Get all active chats for the logged-in user
// @route   GET /api/chat
// @access  Private
const getChats = asyncHandler(async (req, res) => {
  const identity = await getUserIdentity(req.user);

  const query = identity.type === "Doctor" ? { doctorId: identity.id } : { patientId: identity.id };

  const chats = await Chat.find(query)
    .populate("doctorId", "name image speciality")
    .populate("patientId", "name email image")
    .populate("lastMessage")
    .sort({ updatedAt: -1 });

  res.status(200).json(new ApiResponse(200, chats, "Chats fetched"));
});

// @desc    Get messages for a specific chat
// @route   GET /api/chat/:chatId/messages
// @access  Private
const getMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  // Security check
  const chat = await Chat.findById(chatId);
  if (!chat) throw new ApiError(404, "Chat not found");

  const identity = await getUserIdentity(req.user);
  const isParticipant = 
    (identity.type === "Doctor" && chat.doctorId.toString() === identity.id.toString()) ||
    (identity.type === "User" && chat.patientId.toString() === identity.id.toString());

  if (!isParticipant && req.user.role !== "admin" && req.user.role !== "super_admin") {
    throw new ApiError(403, "Not authorized to view this chat");
  }

  const messages = await Message.find({ chatId }).sort({ createdAt: 1 }); // Oldest first for chat UI

  // Mark as read if fetched by the other party
  const unreadMessages = messages.filter(m => m.senderId.toString() !== identity.id.toString() && !m.isRead);
  if (unreadMessages.length > 0) {
    await Message.updateMany(
      { _id: { $in: unreadMessages.map(m => m._id) } },
      { $set: { isRead: true } }
    );
  }

  res.status(200).json(new ApiResponse(200, messages, "Messages fetched"));
});

// @desc    Upload media (voice notes, docs, images) for chat
// @route   POST /api/chat/upload
// @access  Private
const uploadMedia = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, "No file provided");

  const fileUrl = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);

  res.status(200).json(new ApiResponse(200, { fileUrl, fileName: req.file.originalname }, "File uploaded"));
});

module.exports = {
  initChat,
  getChats,
  getMessages,
  uploadMedia
};
