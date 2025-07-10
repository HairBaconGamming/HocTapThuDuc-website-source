const mongoose = require('mongoose');
const Lesson = require('./models/Lesson');

const uri = process.env.MONGO_URI || 'mongodb://localhost/studypro';

mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("Kết nối thành công đến MongoDB.");
    // Xóa hết tất cả các bài đăng (bài học)
    await Lesson.deleteMany({});
    console.log("Đã xóa hết các bài đăng.");
    process.exit(0);
  })
  .catch(err => {
    console.error("Lỗi kết nối: ", err);
    process.exit(1);
  });
