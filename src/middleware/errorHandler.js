const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Default error response
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let error = 'Internal Server Error';

  // Handle specific error types
  if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    error = err.errors.map(e => e.message).join(', ');
  } else if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 409;
    message = 'Duplicate Entry';
    error = 'A record with this information already exists';
  } else if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    message = 'Foreign Key Constraint Error';
    error = 'Referenced record does not exist';
  } else if (err.name === 'SequelizeDatabaseError') {
    statusCode = 500;
    message = 'Database Error';
    error = 'A database error occurred';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid Token';
    error = 'The provided token is invalid';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token Expired';
    error = 'The provided token has expired';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID';
    error = 'The provided ID is invalid';
  } else if (err.code === 'ENOTFOUND') {
    statusCode = 503;
    message = 'Service Unavailable';
    error = 'External service is not available';
  } else if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    message = 'Service Unavailable';
    error = 'Unable to connect to external service';
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal Server Error';
    error = 'An unexpected error occurred';
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      details: error,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method,
    },
  });
};

module.exports = errorHandler;
