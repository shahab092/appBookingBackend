const mongoose = require('mongoose');
const Doctor = require('../models/Docters');
const { sendVideoCallFCM } = require('../utils/pushNotificationService');

const videoSocketHandler = (io) => {
  io.on("connection", (socket) => {
    console.log(`[VideoSocket] New connection: ${socket.id}`);

    // Store multiple user IDs per socket (doctors register twice:
    // once with user._id, once with doctorProfileId)
    socket.userIds = new Set();

    socket.on("register", (userId) => {
      if (!userId) return;
      const id = String(userId);
      socket.userIds.add(id);
      socket.userId = id;
      console.log(`[VideoSocket] Registered: ${id} on socket ${socket.id} | all IDs: [${[...socket.userIds].join(', ')}]`);
    });

    // ── Direct socket lookup by any registered ID ─────────────────────────
    const getSocketByUserId = (userId) => {
      const id = String(userId);
      for (let [, s] of io.sockets.sockets) {
        if (s.userIds && s.userIds.has(id)) return s;
        if (s.userId === id) return s;   // legacy single-id fallback
      }
      return null;
    };

    // ── Smart lookup: also resolves Doctor model _id → User _id ──────────
    // Patients store doctorProfileId (Doctor._id) as targetId.
    // Doctors register with user._id (User._id). This bridges the gap.
    const resolveTargetSocket = async (targetId) => {
      if (!targetId) {
        console.warn('[VideoSocket] resolveTargetSocket called with null/undefined targetId');
        return null;
      }

      const idStr = String(targetId);

      // 1. Direct match
      let sock = getSocketByUserId(idStr);
      if (sock) {
        console.log(`[VideoSocket] Direct match found for ${idStr} → socket ${sock.id}`);
        return sock;
      }

      console.log(`[VideoSocket] Direct match NOT found for ${idStr}. Trying Doctor lookup...`);
      console.log(`[VideoSocket] Connected sockets (${io.sockets.sockets.size}):`,
        [...io.sockets.sockets.values()].map(s => `${s.id}=[${s.userId}]`).join(', ')
      );

      // 2. Maybe targetId is a Doctor model _id — look up their User _id
      if (!mongoose.Types.ObjectId.isValid(idStr)) {
        console.warn(`[VideoSocket] ${idStr} is not a valid ObjectId — skipping Doctor lookup`);
        return null;
      }

      try {
        const doctor = await Doctor.findById(idStr).select('userId name').lean();
        if (!doctor) {
          console.warn(`[VideoSocket] No Doctor found with _id: ${idStr}`);
          return null;
        }

        console.log(`[VideoSocket] Found Doctor "${doctor.name}" with userId: ${doctor.userId}`);

        const userId = doctor.userId ? String(doctor.userId) : null;
        if (!userId) {
          console.warn(`[VideoSocket] Doctor ${idStr} has no userId field!`);
          return null;
        }

        sock = getSocketByUserId(userId);
        if (sock) {
          console.log(`[VideoSocket] Resolved ${idStr} (Doctor._id) → ${userId} (User._id) → socket ${sock.id} ✅`);
        } else {
          console.warn(`[VideoSocket] Doctor found but their User socket (${userId}) is NOT connected. Is the doctor app open?`);
        }
        return sock;
      } catch (err) {
        console.error('[VideoSocket] Doctor lookup error:', err.message);
        return null;
      }
    };

    // ── call-user ─────────────────────────────────────────────────────────
    socket.on("call-user", async ({ targetId, offer, fromName }) => {
      console.log(`[VideoSocket] call-user from ${socket.userId} to ${targetId}`);
      try {
        const targetSocket = await resolveTargetSocket(targetId);
        if (targetSocket) {
          targetSocket.emit("incoming-call", {
            from: socket.userId,
            fromName: fromName || socket.userId,
            offer,
          });
          console.log(`[VideoSocket] incoming-call sent to socket ${targetSocket.id} ✅`);
        } else {
          console.log(`[VideoSocket] target socket not connected for ${targetId}; using FCM fallback.`);
        }

        // ── Send FCM push for offline/background app delivery ──
        // Get the callee's User ID (targetId might be Doctor._id, need to resolve)
        let calleeUserId = targetId;
        if (mongoose.Types.ObjectId.isValid(String(targetId))) {
          try {
            const doctor = await Doctor.findById(targetId).select('userId').lean();
            if (doctor && doctor.userId) {
              calleeUserId = doctor.userId;
            }
          } catch (err) {
            console.warn('[VideoSocket] Could not resolve doctor userId for FCM:', err.message);
          }
        }

        // Send data-only FCM notification for background delivery
        sendVideoCallFCM(calleeUserId, {
          callerName: fromName || socket.userId,
          callerId: socket.userId,
          consultationId: "", // Optional: could be passed in event if available
          appointmentId: "",  // Optional: could be passed in event if available
          offer,
        }).catch(err => {
          console.error('[VideoSocket] FCM video call notification failed:', err.message);
          // Non-fatal — socket delivery already attempted
        });
      } catch (err) {
        console.error('[VideoSocket] call-user error:', err.message);
        // Keep caller ringing and rely on FCM fallback if available.
      }
    });

    // ── answer-call ───────────────────────────────────────────────────────
    socket.on("answer-call", async ({ targetId, answer }) => {
      console.log(`[VideoSocket] answer-call from ${socket.userId} to ${targetId}`);
      try {
        const callerSocket = await resolveTargetSocket(targetId);
        if (callerSocket) {
          callerSocket.emit("call-answered", { from: socket.userId, answer });
        } else {
          console.warn(`[VideoSocket] answer-call: caller ${targetId} socket not found`);
        }
      } catch (err) {
        console.error('[VideoSocket] answer-call error:', err.message);
      }
    });

    // ── ice-candidate ─────────────────────────────────────────────────────
    socket.on("ice-candidate", async ({ targetId, candidate }) => {
      try {
        const targetSocket = await resolveTargetSocket(targetId);
        if (targetSocket) {
          targetSocket.emit("ice-candidate", { from: socket.userId, candidate });
        }
      } catch (err) {
        console.error('[VideoSocket] ice-candidate error:', err.message);
      }
    });

    // ── end-call ──────────────────────────────────────────────────────────
    socket.on("end-call", async (targetId) => {
      console.log(`[VideoSocket] end-call from ${socket.userId} to ${targetId}`);
      try {
        const targetSocket = await resolveTargetSocket(targetId);
        if (targetSocket) {
          targetSocket.emit("call-ended", { from: socket.userId });
        }
      } catch (err) {
        console.error('[VideoSocket] end-call error:', err.message);
      }
    });

    // ── reject-call ───────────────────────────────────────────────────────
    socket.on("reject-call", async ({ targetId }) => {
      try {
        const targetSocket = await resolveTargetSocket(targetId);
        if (targetSocket) {
          targetSocket.emit("call-rejected", { from: socket.userId });
        }
      } catch (err) {
        console.error('[VideoSocket] reject-call error:', err.message);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[VideoSocket] Disconnected: ${socket.id} (userId: ${socket.userId})`);
    });
  });
};

module.exports = videoSocketHandler;
