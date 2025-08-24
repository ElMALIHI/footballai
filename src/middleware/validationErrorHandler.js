const validationErrorHandler = (err, req, res, next) => {
  if (err.isJoi) {
    const error = {
      success: false,
      error: {
        message: 'Validation Error',
        details: err.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
        })),
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
        method: req.method,
      },
    };

    return res.status(400).json(error);
  }

  next(err);
};

module.exports = validationErrorHandler;
