const mongoose = require('mongoose');
const User = require('../models/User');
const Achievement = require('../models/Achievement');
const BanEntry = require('../models/BanEntry');
const Lesson = require('../models/Lesson');
const LessonCompletion = require('../models/LessonCompletion');
const News = require('../models/News');
const ProImage = require('../models/ProImage');
const Subject = require('../models/Subject');
const VisitStats = require('../models/VisitStats');

const MONGODB_URI = process.env.MONGO_URI; // Thay đổi URI phù hợp

async function clearDatabase() {
  await Achievement.deleteMany({});
  await BanEntry.deleteMany({});
  await Lesson.deleteMany({});
  await LessonCompletion.deleteMany({});
  await News.deleteMany({});
  await ProImage.deleteMany({});
  await Subject.deleteMany({});
  await User.deleteMany({});
  await VisitStats.deleteMany({});
  console.log('Đã xóa toàn bộ dữ liệu.');
}

async function seedDatabase() {
  await User.create({ username: 'admin', password: '123456' });
  // Thêm dữ liệu seed khác nếu cần
  console.log('Đã seed dữ liệu mẫu.');
}

mongoose.connect(MONGODB_URI)
  .then(async () => {
    await clearDatabase();
    mongoose.disconnect();
  })
  .catch(err => {
    console.error(err);
    mongoose.disconnect();
  });