// seedUnbanUser.js
const mongoose = require("mongoose");
const BanEntry = require("./models/BanEntry");
const User = require("./models/User");

// Get the username to unban from command-line arguments
const usernameToUnban = process.argv[2];
if (!usernameToUnban) {
  console.error("Usage: node seedUnbanUser.js <username>");
  process.exit(1);
}

// Connect to MongoDB using the MONGO_URI environment variable
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log("Connected to MongoDB.");
    return User.findOne({ username: usernameToUnban });
  })
  .then(user => {
    if (!user) {
      console.error("User not found:", usernameToUnban);
      process.exit(1);
    }
    console.log("Found user:", user.username);
    // Remove BanEntry documents that match the user's last login IP and User-Agent.
    // Adjust the query if you have a different mechanism for linking bans to users.
    return BanEntry.deleteMany({ 
      ip: user.lastLoginIP, 
      userAgent: user.lastloginUA 
    });
  })
  .then(result => {
    console.log(`Unban successful. Deleted ${result.deletedCount} BanEntry document(s).`);
    process.exit(0);
  })
  .catch(err => {
    console.error("Error:", err);
    process.exit(1);
  });
