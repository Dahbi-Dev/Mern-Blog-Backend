// routs/auth.js

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const { handleError } = require("../middleware/errorHandler");

const router = express.Router();

// Register route
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(400).json({ message: "Username already exists" });
      }
      if (existingUser.email === email) {
        return res.status(400).json({ message: "Email already registered" });
      }
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const userDoc = await User.create({
      username,
      email,
      password: hashedPassword,
      isAdmin: email === process.env.ADMIN_EMAIL,
    });

    res.json({ message: "Registration successful", id: userDoc._id });
  } catch (error) {
    handleError(res, error, "Registration failed");
  }
});

// Login route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const userDoc = await User.findOne({ email });
    if (!userDoc) {
      return res.status(400).json({ message: "User not found" });
    }

    const passOK = bcrypt.compareSync(password, userDoc.password);
    if (!passOK) {
      return res.status(400).json({ message: "Invalid password" });
    }

    jwt.sign(
      {
        email,
        id: userDoc._id,
        username: userDoc.username,
        isAdmin: userDoc.isAdmin,
      },
      process.env.SECRET,
      { expiresIn: "7d" },
      (err, token) => {
        if (err) throw err;
        res
          .cookie("token", token, {
            httpOnly: false, // Allow JavaScript access
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
          })
          .json({
            id: userDoc._id,
            username: userDoc.username,
            email: userDoc.email,
            isAdmin: userDoc.isAdmin,
            token: token, // Send token in response for localStorage
          });
      }
    );
  } catch (error) {
    handleError(res, error, "Login failed");
  }
});

// Logout route
router.post("/logout", async (req, res) => {
  try {
    res
      .cookie("token", "", {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        expires: new Date(0),
      })
      .json({ message: "Logged out successfully" });
  } catch (error) {
    handleError(res, error, "Logout failed");
  }
});

// Generate and send reset code
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate a 6-digit code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashCode = bcrypt.hashSync(resetCode, 10);

    // Set token expiration to 15 minutes from now
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + 15);

    // Save the hashed code and expiration
    user.resetPasswordToken = hashCode;
    user.resetPasswordExpires = expirationTime;
    await user.save();

    // Return the code (in production, this would be sent via email)
    res.json({
      message: "Reset code generated successfully",
      resetCode, // Remove this in production
      expiresIn: "15 minutes",
    });
  } catch (error) {
    handleError(res, error, "Failed to generate reset code");
  }
});

// Verify reset code and update password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;
    const user = await User.findOne({
      email,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired reset code",
      });
    }

    // Verify the reset code
    const isValidCode = bcrypt.compareSync(resetCode, user.resetPasswordToken);
    if (!isValidCode) {
      return res.status(400).json({
        message: "Invalid reset code",
      });
    }

    // Update password and clear reset fields
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    handleError(res, error, "Failed to reset password");
  }
});

// Profile route
router.get("/profile", async (req, res) => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.SECRET);
    res.json(decoded);
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
});

module.exports = router;