// middlewares/banCheck.js
const BanEntry = require("../models/BanEntry");
const mongoose = require("mongoose");

async function banCheck(req, res, next) {
  try {
    // Check DB connection before attempting query
    if(mongoose.connection.readyState !== 1) {
      console.warn("⚠️  BanCheck: Skipped (DB not ready)");
      return next(); // Allow request if DB is down
    }

    // Retrieve identifying info:
    const ip = req.ip;
    const userAgent = req.get("User-Agent") || "";
    const banToken = req.cookies && req.cookies.banToken;

    // Find any active ban entry with timeout protection
    const ban = await BanEntry.findOne({
      $or: [
        { ip: ip },
        { userAgent: userAgent },
        { banToken: banToken }
      ],
      expiresAt: { $gt: new Date() }
    });

    if (ban) {
      return res.status(403).send("Your access has been permanently restricted.");
    }
    next();
  } catch (err) {
    // Log error but don't block request if DB fails
    if(err.name === 'MongooseError' || err.name === 'MongoNetworkError') {
      console.warn("⚠️  BanCheck timeout/error - allowing request:", err.message);
    } else {
      console.error("❌ Error checking ban:", err.message);
    }
    next(); // Continue anyway to avoid blocking users when DB is slow
  }
}

module.exports = { banCheck };
