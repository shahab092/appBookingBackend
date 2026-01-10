const { notificationSocketHandler } = require("./notificationSocketHandler");
const videoSocketHandler = require("./video.socket");

const initSockets = (io) => {
  videoSocketHandler(io);
  notificationSocketHandler(io);
};

module.exports = { initSockets };
