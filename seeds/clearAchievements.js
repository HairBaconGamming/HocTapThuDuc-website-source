// seeds/clearAchievements.js
require('dotenv').config();
const mongoose = require("mongoose");
const User = require("../models/User");
const Achievement = require("../models/Achievement");

// Kết nối tới MongoDB
const uri = process.env.MONGO_URI;
mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log("Connected to MongoDB");
  clearAchievements();
}).catch(err => {
  console.error("MongoDB connection error:", err);
  process.exit(1);
});

// Lấy username từ tham số dòng lệnh
const username = process.argv[2];
if (!username) {
  console.error("Vui lòng cung cấp username làm tham số dòng lệnh.");
  process.exit(1);
}

async function clearAchievements() {
  try {
    // Tìm user theo username
    const user = await User.findOne({ username });
    if (!user) {
      console.error(`Không tìm thấy user với username: ${username}`);
      process.exit(1);
    }
    // Xóa tất cả achievement của user đó
    const result = await Achievement.deleteMany({ user: user._id });
    console.log(`Đã xóa ${result.deletedCount} thành tích của user ${username}.`);
  } catch (err) {
    console.error("Error clearing achievements:", err);
  } finally {
    mongoose.connection.close();
  }
}
