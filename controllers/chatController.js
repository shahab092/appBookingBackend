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
  const { appointmentId } = req.body;
  if (!appointmentId) throw new ApiError(400, "appointmentId is required");

  const Appointment = require("../models/Appointment");

  const identity = await getUserIdentity(req.user);

  // ── Step 1: Fetch the exact appointment the caller passed.
  //    appointmentId IS the primary key for chat isolation.
  //    Do NOT replace it with another IN_PROGRESS consultation —
  //    a doctor or patient can have multiple concurrent appointments,
  //    and each one must have its own separate chat room.
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new ApiError(404, "Appointment not found");

  // ── Step 2: Verify the caller is a participant of THIS appointment
  const isParticipant =
    (identity.type === "Doctor" &&
      appointment.doctorId.toString() === identity.id.toString()) ||
    (identity.type === "User" &&
      appointment.patientId &&
      appointment.patientId.toString() === identity.id.toString());

  if (!isParticipant) {
    console.warn(
      `[initChat] REJECTED: ${identity.type} ${identity.id}` +
      ` is not a participant of appointment ${appointmentId}`
    );
    throw new ApiError(403, "You are not authorized to join the chat for this appointment");
  }

  // ── Step 3: Atomic find-or-create — one chat room per appointmentId.
  //    The unique index on Chat.appointmentId prevents duplicates even
  //    under concurrent requests.
  const rawChat = await Chat.findOneAndUpdate(
    { appointmentId },
    {
      $setOnInsert: {
        appointmentId,
        doctorId:  appointment.doctorId,
        patientId: appointment.patientId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const chat = await Chat.findById(rawChat._id)
    .populate("doctorId", "name image speciality")
    .populate("patientId", "name email image");

  console.log(`[initChat] ✅ chatId: ${chat._id} for appointmentId: ${appointmentId}`);

  res.status(200).json(new ApiResponse(200, chat, "Chat initialized"));
});


// @desc    Get chats for the logged-in user
// @route   GET /api/chat
// @route   GET /api/chat?appointmentId=<id>   ← returns the single chat for that appointment
// @access  Private
const getChats = asyncHandler(async (req, res) => {
  const identity = await getUserIdentity(req.user);

  // Base filter — always scoped to the calling user so they can only
  // ever see their own chats.
  const query = identity.type === "Doctor"
    ? { doctorId: identity.id }
    : { patientId: identity.id };

  // Optional: narrow to a single appointment's chat room.
  // Useful when the frontend navigates directly from an appointment card
  // without loading the full inbox first.
  if (req.query.appointmentId) {
    query.appointmentId = req.query.appointmentId;
  }

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
