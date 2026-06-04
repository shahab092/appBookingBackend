// ============================================================
// consultationSocketHandler.js
// Handles real-time consultation status events emitted to patients
// Pattern: same as notificationSocketHandler – user joins room = userId
// ============================================================

const Consultation = require("../models/Consultation");
const Doctor = require("../models/Docters");

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

    const emitPatientStatusToDoctor = async (data, patientStatus, callback) => {
      try {
        if (!socket.userId) {
          if (callback) callback({ success: false, error: "Socket is not identified" });
          return;
        }

        const { consultationId, appointmentId } = data || {};

        if (!consultationId && !appointmentId) {
          if (callback) {
            callback({
              success: false,
              error: "consultationId or appointmentId is required",
            });
          }
          return;
        }

        const consultation = await Consultation.findOne(
          consultationId
            ? { _id: consultationId }
            : { appointmentId },
        );

        if (!consultation) {
          if (callback) callback({ success: false, error: "Consultation not found" });
          return;
        }

        if (consultation.patientId?.toString() !== socket.userId.toString()) {
          console.warn(
            `[Consultation Socket] ${patientStatus} rejected: patient ${socket.userId} is not part of consultation ${consultation._id}`,
          );
          if (callback) callback({ success: false, error: "Not authorized" });
          return;
        }

        consultation.patientStatus = patientStatus;
        await consultation.save();

        const doctor = await Doctor.findById(consultation.doctorId).select("userId");
        const payload = {
          consultationId: consultation._id.toString(),
          appointmentId: consultation.appointmentId.toString(),
          patientId: consultation.patientId.toString(),
          doctorId: consultation.doctorId.toString(),
          status: patientStatus,
          patientStatus,
          updatedAt: consultation.updatedAt,
        };

        if (doctor?.userId) {
          consultationNamespace.to(doctor.userId.toString()).emit("consultation:patient_status", payload);
          consultationNamespace.to(doctor.userId.toString()).emit(
            patientStatus === "PATIENT_REJECTED" ? "patient_rejected" : "patient_joined",
            payload,
          );
        }

        consultationNamespace.to(consultation.doctorId.toString()).emit("consultation:patient_status", payload);
        consultationNamespace.to(consultation.doctorId.toString()).emit(
          patientStatus === "PATIENT_REJECTED" ? "patient_rejected" : "patient_joined",
          payload,
        );

        console.log(
          `[Consultation Socket] ${patientStatus} for consultation ${consultation._id} emitted to doctor ${consultation.doctorId}`,
        );

        if (callback) callback({ success: true, ...payload });
      } catch (error) {
        console.error(`[Consultation Socket] ${patientStatus} error:`, error);
        if (callback) callback({ success: false, error: error.message });
      }
    };

    socket.on("patient_joined", (data, callback) => {
      emitPatientStatusToDoctor(data, "PATIENT_JOINED", callback);
    });

    socket.on("patient_rejected", (data, callback) => {
      emitPatientStatusToDoctor(data, "PATIENT_REJECTED", callback);
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
