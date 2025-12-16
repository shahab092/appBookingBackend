const videoSocketHandler = require("./video.socket");

const initSockets = (io) => {
  videoSocketHandler(io);
};

module.exports = { initSockets };
