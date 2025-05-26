// server.js

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
require("dotenv").config();

// Import routes
const authRoutes = require("./routes/auth");
const postRoutes = require("./routes/posts");
const adminRoutes = require("./routes/admin");
const visitorRoutes = require("./routes/visitors");

// Import middleware
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Middleware setup
app.use(
  cors({
    origin: true, // Allow all origins
    credentials: true, // Allow credentials
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], // Allow all common HTTP methods
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ], // Allow common headers
  })
);

app.use(express.json());
app.use(cookieParser());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Home route
app.get("/", (req, res) => {
  res.send(`
    <div style="text-align: center; padding: 20px;">
      <h1>Server Running</h1>
      <p>Server is running on port ${process.env.PORT || 3001}</p>
    </div>
  `);
});

// Use routes
app.use("/", authRoutes);
app.use("/", postRoutes);
app.use("/admin", adminRoutes);
app.use("/api", visitorRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});