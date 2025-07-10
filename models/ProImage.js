// models/ProImage.js
const mongoose = require("mongoose");

const ProImageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  filename: { type: String, required: true },
  url: { type: String, required: true },
  size: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ProImage", ProImageSchema);
