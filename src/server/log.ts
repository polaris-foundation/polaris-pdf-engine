const httpContext  = require ('express-http-context');
import winston = require('winston');
import logform = require('logform');
const { combine, timestamp, colorize, simple } = winston.format;
const LEVEL = Symbol.for('level');
const MESSAGE: symbol = Symbol.for('message');

const jsonFormatter: logform.TransformFunction = (logEntry: any) => {
  const requestId = httpContext.get('requestId');

  const base = {
    timestamp: new Date(),
    severity: logEntry[LEVEL].toUpperCase(),
    requestID: requestId
  };

  const json = Object.assign(base, logEntry);
  logEntry[MESSAGE] = JSON.stringify(json);
  return logEntry;
};

let format = process.env.NODE_ENV === 'jest'
  ? combine(timestamp(), colorize(), simple())
  : winston.format(jsonFormatter)();

export const log: winston.Logger = winston.createLogger({
  level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  format: format,
  transports: [new winston.transports.Console()]
});
