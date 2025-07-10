// models/BanEntry.js
const mongoose = require("mongoose");

const BanEntrySchema = new mongoose.Schema({
  ip: { type: String, required: true },
  userAgent: { type: String, required: true },
  banToken: { type: String, required: true }, // a unique token that you also set as a cookie
  bannedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date } // optional: for temporary bans
});

module.exports = mongoose.model("BanEntry", BanEntrySchema);
