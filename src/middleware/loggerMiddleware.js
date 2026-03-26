const morgan = require("morgan");
const logger = require("../utils/logger");

const stream = {
  write: (message) => logger.info(message.trim()),
};

const httpLogger = morgan(
  ":method :url :status :res[content-length] - :response-time ms",
  { stream },
);

module.exports = httpLogger;
