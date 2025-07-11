const mongoose = require('mongoose');
const User = require('../models/User'); // Thay đổi theo model của bạn
const Post = require('../models/Post'); // Thay đổi theo model của bạn
// Thêm các model khác nếu cần

const MONGODB_URI = 'mongodb://localhost:27017/ten_database'; // Thay đổi URI phù hợp

async function clearDatabase() {
  await User.deleteMany({});
  await Post.deleteMany({});
  // Thêm các model khác nếu cần
  console.log('Đã xóa toàn bộ dữ liệu.');
}

async function seedDatabase() {
  await User.create({ username: 'admin', password: '123456' });
  await Post.create({ title: 'Bài viết đầu tiên', content: 'Nội dung...' });
  // Thêm dữ liệu seed khác nếu cần
  console.log('Đã seed dữ liệu mẫu.');
}

mongoose.connect(MONGODB_URI)
  .then(async () => {
    await clearDatabase();
    await seedDatabase();
    mongoose.disconnect();
  })
  .catch(err => {
    console.error(err);
    mongoose.disconnect();
  });