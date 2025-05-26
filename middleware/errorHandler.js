// errorHandler.js

// Enhanced error handling middleware
const errorHandler = async (err, req, res, next) => {
  console.error("Error details:", {
    message: err.message,
    stack: err.stack,
    body: req.body,
    params: req.params,
    query: req.query
  });

  if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") {
    return res.status(401).json({
      error: "AUTH_ERROR",
      message: "Session expired. Please login again.",
    });
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: err.message,
    });
  }

  if (err.name === "MulterError") {
    return res.status(400).json({
      error: "FILE_UPLOAD_ERROR",
      message: "File upload failed: " + err.message,
    });
  }

  res.status(500).json({
    error: "SERVER_ERROR",
    message: "An unexpected error occurred",
    details: process.env.NODE_ENV === "development" ? err.message : undefined
  });
};

// Helper function for error handling
function handleError(res, error, message) {
  console.error("Error:", error);
  res.status(500).json({ 
    message, 
    error: error.message,
    details: process.env.NODE_ENV === "development" ? error.stack : undefined
  });
}

module.exports = errorHandler;
module.exports.handleError = handleError;