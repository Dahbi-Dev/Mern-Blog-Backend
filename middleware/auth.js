// middleware/auth.js

const jwt = require("jsonwebtoken");
const User = require("../models/user");

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const { token } = req.cookies;
    if (!token) {
      return res.status(401).json({
        error: "AUTH_REQUIRED",
        message: "Authentication required",
      });
    }

    const decoded = jwt.verify(token, process.env.SECRET);

    // Check if user still exists in database
    const userExists = await User.findById(decoded.id);
    if (!userExists) {
      res.clearCookie("token");
      return res.status(401).json({
        error: "USER_NOT_FOUND",
        message: "User no longer exists",
      });
    }

    req.user = {
      ...decoded,
      isAdmin: userExists.isAdmin,
    };
    next();
  } catch (err) {
    res.clearCookie("token");
    return res.status(403).json({
      error: "INVALID_TOKEN",
      message: "Invalid or expired token",
    });
  }
};

// Admin middleware
const isAdmin = (req, res, next) => {
  if (req.user.email !== process.env.ADMIN_EMAIL) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

module.exports = {
  authenticateToken,
  isAdmin,
};