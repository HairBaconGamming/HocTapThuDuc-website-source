// middlewares/banCheck.js
const BanEntry = require("../models/BanEntry");

async function banCheck(req, res, next) {
  try {
    // Retrieve identifying info:
    const ip = req.ip;
    const userAgent = req.get("User-Agent") || "";
    const banToken = req.cookies && req.cookies.banToken; // requires cookie-parser middleware

    // Find any active ban entry for this IP, user agent, or token.
    // Adjust the logic as needed (e.g., using an OR condition).
    const ban = await BanEntry.findOne({
      $or: [
        { ip: ip },
        { userAgent: userAgent },
        { banToken: banToken }
      ],
      // If you use temporary bans, you can add:
      expiresAt: { $gt: new Date() }
    });

    if (ban) {
      return res.status(403).send("Your access has been permanently restricted.");
    }
    next();
  } catch (err) {
    console.error("Error checking ban:", err);
    next(err);
  }
}

module.exports = { banCheck };
