// src/utils/logger.ts

import winston from 'winston';

/**
 * Creates a logger instance with the given module name
 * 
 * @param module The name of the module using this logger
 * @returns A winston logger instance
 */
export function createLogger(module: string) {
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ level, message, timestamp, ...meta }) => {
        return `${timestamp} [${level.toUpperCase()}] [${module}]: ${message} ${
          Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
        }`;
      })
    ),
    transports: [
      // Output to console
      new winston.transports.Console(),
      
      // You can add file logging as well
      // new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      // new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
  });

  return {
    debug: (message: string, meta?: any) => logger.debug(message, meta),
    info: (message: string, meta?: any) => logger.info(message, meta),
    warn: (message: string, meta?: any) => logger.warn(message, meta),
    error: (message: string, meta?: any) => logger.error(message, meta),
  };
}

// Default logger for general application use
export const appLogger = createLogger('app');