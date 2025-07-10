// seeds/seedProKeys.js
const mongoose = require("mongoose");
const crypto = require("crypto");
const User = require("../models/User");

mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/your-db", {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

function generateSecretKey() {
  // Generate a 16-character hex string (adjust length as needed)
  return crypto.randomBytes(8).toString('hex');
}

async function seedProKeys() {
  try {
    const users = await User.find({});
    for (let user of users) {
      // Only update if not already set (or force update if needed)
      if (!user.proSecretKey) {
        user.proSecretKey = generateSecretKey();
        await user.save();
        console.log(`Updated ${user.username} with key: ${user.proSecretKey}`);
      }
    }
    console.log("Finished seeding PRO secret keys.");
    mongoose.connection.close();
  } catch (err) {
    console.error(err);
    mongoose.connection.close();
  }
}

seedProKeys();
