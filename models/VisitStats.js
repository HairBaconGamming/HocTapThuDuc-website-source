// models/VisitStats.js
const mongoose = require("mongoose");

const visitStatsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 }
});

module.exports = mongoose.model("VisitStats", visitStatsSchema);
