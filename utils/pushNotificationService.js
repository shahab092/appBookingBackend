const admin = require("../config/firebaseAdmin");
const DeviceToken = require("../models/DeviceToken");
const Notification = require("../models/Notification");
const { getIo } = require("../sockets");

/**
 * Sends a notification to a specific user via multiple channels:
 * 1. Database (saves for history)
 * 2. Socket.IO (if online)
 * 3. FCM Push (if device tokens are registered)
 * 
 * Automatically cleans up invalid/stale FCM tokens.
 * 
 * @param {string} userId - ID of the target user
 * @param {object} payload - Notification details: { title, body, data, type, link }
 */
const sendNotificationToUser = async (userId, { title, body, data = {}, type = "info", link = "" }) => {
  try {
    // 1. Save notification to Database
    const notification = await Notification.create({
      user: userId,
      title,
      message: body,
      type,
      link,
    });

    // 2. Deliver via Socket.io (In-app realtime delivery)
    const io = getIo();
    if (io) {
      io.to(userId.toString()).emit("new-notification", notification);
    }

    // 3. Deliver via FCM
    // Find all registered device tokens for the user
    const deviceTokens = await DeviceToken.find({ user: userId });
    if (!deviceTokens || deviceTokens.length === 0) {
      return { success: true, dbNotification: notification, pushSentCount: 0 };
    }

    const tokens = deviceTokens.map(dt => dt.token);

    // If Firebase Admin is not initialized, skip FCM silently
    if (!admin || !admin.apps || admin.apps.length === 0) {
      console.warn("⚠️ Firebase Admin not available. Skipping FCM delivery.");
      return { success: true, dbNotification: notification, pushSentCount: 0 };
    }

    // Build messages list for FCM Batch send
    const messages = tokens.map(token => ({
      token,
      notification: {
        title,
        body,
      },
      data: {
        title: String(title),
        body: String(body),
        type: String(type),
        link: String(link),
        click_action: String(link || "/"),
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {}),
      },
      webpush: {
        notification: {
          icon: "/logo.png",
          badge: "/badge.png",
          click_action: link || "/",
        },
      },
      android: {
        priority: "high",
        notification: {
          sound: "default",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    }));

    const response = await admin.messaging().sendEach(messages);
    console.log(`Successfully sent ${response.successCount} / ${messages.length} FCM messages.`);

    // 4. Stale Token Pruning (Self-Healing)
    const tokensToDelete = [];
    response.responses.forEach((res, idx) => {
      if (!res.success) {
        const error = res.error;
        console.error(`FCM message failed for token ${tokens[idx].substring(0, 10)}... Error:`, error.code || error.message);

        // Handle common inactive/stale token codes
        if (
          error.code === "messaging/registration-token-not-registered" ||
          error.code === "messaging/invalid-argument" ||
          error.code === "messaging/invalid-registration-token" ||
          error.code === "messaging/authentication-error" // Invalid key check
        ) {
          tokensToDelete.push(tokens[idx]);
        }
      }
    });

    if (tokensToDelete.length > 0) {
      const deleteResult = await DeviceToken.deleteMany({ token: { $in: tokensToDelete } });
      console.log(`Pruned ${deleteResult.deletedCount} inactive device tokens.`);
    }

    return {
      success: true,
      dbNotification: notification,
      pushSentCount: response.successCount,
      prunedCount: tokensToDelete.length,
    };
  } catch (error) {
    console.error("Error in sendNotificationToUser:", error);
    throw error;
  }
};

/**
 * Sends a notification to multiple users (e.g. Broadcasts)
 * @param {string[]} userIds - Array of user IDs
 * @param {object} payload - Notification details: { title, body, data, type, link }
 */
const sendNotificationToMultipleUsers = async (userIds, { title, body, data = {}, type = "info", link = "" }) => {
  try {
    const promises = userIds.map(userId =>
      sendNotificationToUser(userId, { title, body, data, type, link })
    );
    const results = await Promise.allSettled(promises);
    return results;
  } catch (error) {
    console.error("Error in sendNotificationToMultipleUsers:", error);
    throw error;
  }
};

/**
 * Sends a HIGH-PRIORITY data-only FCM message when a doctor starts a consultation.
 * Data-only (no `notification` block) so Android delivers it headlessly even when
 * the app is killed — the RN Firebase background handler shows the full-screen UI.
 *
 * @param {string} patientUserId  - User._id of the patient
 * @param {{ consultationId, appointmentId, doctorName }} payload
 */
const sendConsultationFCM = async (patientUserId, { consultationId, appointmentId, doctorName }) => {
  try {
    const deviceTokens = await DeviceToken.find({ user: patientUserId });
    if (!deviceTokens || deviceTokens.length === 0) {
      console.log(`[FCM] No device tokens for patient ${patientUserId}. Skipping FCM.`);
      return { success: true, pushSentCount: 0 };
    }

    if (!admin || !admin.apps || admin.apps.length === 0) {
      console.warn("⚠️ Firebase Admin not available. Skipping consultation FCM.");
      return { success: true, pushSentCount: 0 };
    }

    const tokens = deviceTokens.map((dt) => dt.token);

    // Build data-only messages (no `notification` block so Android handles it headlessly)
    const messages = tokens.map((token) => ({
      token,
      // NO notification block — keeps it as a data message
      data: {
        type:           "CONSULTATION_STARTED",
        consultationId: String(consultationId),
        appointmentId:  String(appointmentId),
        doctorName:     String(doctorName || "Your Doctor"),
      },
      android: {
        priority: "high",
      },
      apns: {
        headers: {
          "apns-priority": "10",
          "apns-push-type": "background",
        },
        payload: {
          aps: {
            "content-available": 1,
          },
        },
      },
    }));

    const response = await admin.messaging().sendEach(messages);
    console.log(`[FCM] Consultation FCM sent: ${response.successCount}/${messages.length}`);

    // Prune stale tokens
    const tokensToDelete = [];
    response.responses.forEach((res, idx) => {
      if (!res.success) {
        const code = res.error?.code || "";
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token" ||
          code === "messaging/invalid-argument"
        ) {
          tokensToDelete.push(tokens[idx]);
        }
      }
    });
    if (tokensToDelete.length > 0) {
      await DeviceToken.deleteMany({ token: { $in: tokensToDelete } });
      console.log(`[FCM] Pruned ${tokensToDelete.length} stale tokens.`);
    }

    return { success: true, pushSentCount: response.successCount };
  } catch (error) {
    console.error("[FCM] sendConsultationFCM error:", error);
    // Non-fatal — socket already notified the patient if app is open
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendNotificationToUser,
  sendNotificationToMultipleUsers,
  sendConsultationFCM,
};
