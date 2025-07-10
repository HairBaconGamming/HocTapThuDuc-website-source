// seeds/seedBanUser.js
const mongoose = require('mongoose');
require('dotenv').config(); // load env variables if using dotenv

// Import the User model – adjust the path if needed
const User = require('../models/User');

// Get the username to ban from command-line arguments or hard-code it for testing.
const usernameToBan = process.argv[2] || 'testuser'; 

// Connect to MongoDB using MONGO_URI from environment variables.
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/yourdbname', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log("Connected to MongoDB.");
  return User.findOne({ username: usernameToBan });
})
.then(user => {
  if (!user) {
    console.error(`User with username "${usernameToBan}" not found.`);
    process.exit(1);
  }
  // Mark the user as banned.
  user.isBanned = true;
  return user.save();
})
.then(() => {
  console.log(`User "${usernameToBan}" has been banned successfully.`);
  process.exit(0);
})
.catch(err => {
  console.error("Error during seeding:", err);
  process.exit(1);
});
