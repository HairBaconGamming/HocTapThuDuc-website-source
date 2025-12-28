// models/VisitStats.js
const mongoose = require("mongoose");

const visitStatsSchema = new mongoose.Schema({
  key: { type: String, unique: true, sparse: true },
  date: { type: Date, unique: true, sparse: true },
  count: { type: Number, default: 0 }
});

module.exports = mongoose.model("VisitStats", visitStatsSchema);
