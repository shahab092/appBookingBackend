// ============================================================
// consultationSocketHandler.js
// Handles real-time consultation status events emitted to patients
// Pattern: same as notificationSocketHandler – user joins room = userId
// ============================================================

const consultationSocketHandler = (io) => {
  const consultationNamespace = io.of("/consultation");

  consultationNamespace.on("connection", (socket) => {
    console.log("[Consultation Socket] User connected:", socket.id);

    /**
     * Patient/Doctor calls this after connecting so the server
     * knows which room to emit consultation events to.
     * Event: "identify"
     * Payload: userId (string)
     */
    socket.on("identify", (userId) => {
      if (!userId) return;
      socket.userId = userId;
      socket.join(userId.toString()); // room = userId
      console.log(`[Consultation Socket] User identified: ${userId}`);
    });

    socket.on("disconnect", () => {
      console.log("[Consultation Socket] User disconnected:", socket.id);
    });
  });
};

/**
 * Emit "consultation:inprogress" to the patient's socket room.
 * Called from consultationController when a doctor starts a consultation.
 *
 * @param {import("socket.io").Server} io
 * @param {string|object} patientUserId  - The User._id of the patient
 * @param {object} payload               - Data to send to the patient
 */
const emitConsultationInProgress = (io, patientUserId, payload) => {
  const consultationNamespace = io.of("/consultation");
  consultationNamespace
    .to(patientUserId.toString())
    .emit("consultation:inprogress", payload);

  console.log(
    `[Consultation Socket] Emitted consultation:inprogress to patient ${patientUserId}`
  );
};

module.exports = { consultationSocketHandler, emitConsultationInProgress };
