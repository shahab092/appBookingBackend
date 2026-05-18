const { notificationSocketHandler } = require("./notificationSocketHandler");
const videoSocketHandler = require("./video.socket");
const { chatSocketHandler } = require("./chatSocketHandler");

const initSockets = (io) => {
  videoSocketHandler(io);
  notificationSocketHandler(io);
  chatSocketHandler(io);
};

module.exports = { initSockets };

