// routes/visitors.js

const express = require("express");
const User = require("../models/user");
const Visitor = require("../models/Visitor");
const { handleError } = require("../middleware/errorHandler");

const router = express.Router();

// POST endpoint to add a new visitor
router.post('/visitors', async (req, res) => {
  try {
    const { city, country } = req.body;
    
    if (!city || !country) {
      return res.status(400).json({ error: 'City and country are required' });
    }

    const newVisitor = new Visitor({
      city,
      country,
      dateAccepted: new Date(),
    });

    await newVisitor.save();
    const visitorCount = await Visitor.countDocuments();
    res.status(201).json({ count: visitorCount });
  } catch (error) {
    console.error("Error adding visitor:", error);
    res.status(500).json({ error: 'Failed to add new visitor', details: error.message });
  }
});

// GET endpoint to retrieve the visitor count
router.get("/visitors", async (req, res) => {
  try {
    const visitorCount = await Visitor.countDocuments();
    res.json({ count: visitorCount });
  } catch (error) {
    handleError(res, error, "Failed to retrieve visitor count");
  }
});

// Route to count total users
router.get("/user-count", async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.status(200).json({ count: userCount });
  } catch (error) {
    handleError(res, error, "Failed to fetch user count");
  }
});

module.exports = router;