// seeds/seedUnban.js
const mongoose = require("mongoose");
const User = require("../models/User");
const BannedIP = require("../models/BannedIP");

mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/your-db", {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function seedUnban() {
  try {
    // Replace this with the username you want to unban
    const usernameToUnban = "nam123";
    const user = await User.findOne({ username: usernameToUnban });
    if (!user) {
      console.log("No user found with username:", usernameToUnban);
    } else {
      const ipToUnban = user.lastLoginIP;
      if (!ipToUnban || ipToUnban.trim() === "") {
        console.log("User does not have a recorded IP to unban.");
      } else {
        // Remove the banned IP record
        const result = await BannedIP.deleteOne({ ip: ipToUnban });
        if (result.deletedCount > 0) {
          console.log(`Successfully unbanned IP ${ipToUnban} for user ${usernameToUnban}`);
        } else {
          console.log(`No banned record found for IP ${ipToUnban}`);
        }
        // Optionally mark the user as unbanned
        user.isBanned = false;
        await user.save();
        console.log(`User ${usernameToUnban} marked as unbanned.`);
      }
    }
    mongoose.connection.close();
  } catch (err) {
    console.error(err);
    mongoose.connection.close();
  }
}

seedUnban();
