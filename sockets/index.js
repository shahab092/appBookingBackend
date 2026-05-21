const { notificationSocketHandler } = require("./notificationSocketHandler");
const videoSocketHandler = require("./video.socket");
const { chatSocketHandler } = require("./chatSocketHandler");

let ioInstance = null;

const initSockets = (io) => {
  ioInstance = io;
  videoSocketHandler(io);
  notificationSocketHandler(io);
  chatSocketHandler(io);
};

const getIo = () => ioInstance;

module.exports = { initSockets, getIo };

