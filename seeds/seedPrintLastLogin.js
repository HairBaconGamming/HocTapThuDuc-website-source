// seedPrintLastLogin.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require("../models/User");

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("Connected to MongoDB for seeding..."))
  .catch(err => {
    console.error("Error connecting to MongoDB:", err);
    process.exit(1);
  });

// Thay đổi usernameToFind theo tên người dùng cần kiểm tra
const usernameToFind = "Acnologia";

async function printLastLoginIP() {
  try {
    const user = await User.findOne({ username: usernameToFind });
    if (!user) {
      console.error(`User "${usernameToFind}" not found.`);
      process.exit(1);
    }
    console.log(`Tài khoản ${user.username} đã đăng nhập lần cuối từ IP: ${user.lastLoginIP}`);
    process.exit(0);
  } catch (err) {
    console.error("Error retrieving user:", err);
    process.exit(1);
  }
}

printLastLoginIP();
