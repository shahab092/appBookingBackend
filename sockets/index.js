const { notificationSocketHandler } = require("./notificationSocketHandler");
const videoSocketHandler = require("./video.socket");
const { chatSocketHandler } = require("./chatSocketHandler");
const { consultationSocketHandler } = require("./consultationSocketHandler");

let ioInstance = null;

const initSockets = (io) => {
  ioInstance = io;
  videoSocketHandler(io);
  notificationSocketHandler(io);
  chatSocketHandler(io);
  consultationSocketHandler(io);
};

const getIo = () => ioInstance;

module.exports = { initSockets, getIo };

