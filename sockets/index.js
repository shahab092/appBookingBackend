const { notificationSocketHandler } = require("./notificationSocketHandler");
const videoSocketHandler = require("./video.socket");
const { chatSocketHandler } = require("./chatSocketHandler");
const { consultationSocketHandler } = require("./consultationSocketHandler");

const initSockets = (io) => {
  videoSocketHandler(io);
  notificationSocketHandler(io);
  chatSocketHandler(io);
  consultationSocketHandler(io);
};

module.exports = { initSockets };

