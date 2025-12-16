const videoSocketHandler = (io) => {
  io.on("connection", (socket) => {
    console.log(" User connected:", socket.id);

    // Register user
    socket.on("register", (userId) => {
      socket.userId = userId;
      console.log(`User registered: ${userId} (socket: ${socket.id})`);
    });

    const getSocketByUserId = (userId) => {
      for (let [_, s] of io.sockets.sockets) {
        if (s.userId === userId) return s;
      }
      return null;
    };

    socket.on("call-user", ({ targetId, offer, fromName }) => {
      const targetSocket = getSocketByUserId(targetId);

      if (targetSocket) {
        targetSocket.emit("incoming-call", {
          from: socket.userId,
          fromName: fromName || socket.userId,
          offer,
        });
      } else {
        socket.emit("user-offline", { targetId });
      }
    });

    socket.on("answer-call", ({ targetId, answer }) => {
      const callerSocket = getSocketByUserId(targetId);

      if (callerSocket) {
        callerSocket.emit("call-answered", {
          from: socket.userId,
          answer,
        });
      }
    });

    socket.on("ice-candidate", ({ targetId, candidate }) => {
      const targetSocket = getSocketByUserId(targetId);

      if (targetSocket) {
        targetSocket.emit("ice-candidate", {
          from: socket.userId,
          candidate,
        });
      }
    });

    socket.on("end-call", (targetId) => {
      const targetSocket = getSocketByUserId(targetId);

      if (targetSocket) {
        targetSocket.emit("call-ended", {
          from: socket.userId,
        });
      }
    });

    socket.on("disconnect", () => {
      console.log(" User disconnected:", socket.id);
    });
  });
};

module.exports = videoSocketHandler;
