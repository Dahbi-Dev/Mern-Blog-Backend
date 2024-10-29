const mongoose = require("mongoose");

const visitorSchema = new mongoose.Schema({
  city: { type: String, required: true },
  country: { type: String, required: true },
  dateAccepted: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Visitor", visitorSchema);
