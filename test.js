// seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const Lesson = require('./models/Lesson');
const Subject = require('./models/Subject');

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("Connected to MongoDB for seeding..."))
  .catch((err) => {
    console.error("Error connecting to MongoDB:", err);
    process.exit(1);
  });

// Sử dụng ObjectId cụ thể từ yêu cầu
const systemUserId = mongoose.Types.ObjectId("67dc37c5333c73b751f94d19");

async function seedLessons() {
  try {
    // Lấy các môn học cần seed: Toán, Văn, Anh
    const toan = await Subject.findOne({ name: "Toán" });
    const van = await Subject.findOne({ name: "Văn" });
    const anh = await Subject.findOne({ name: "Anh" });
    if (!toan || !van || !anh) {
      console.error("Vui lòng seed subjects (Toán, Văn, Anh) trước!");
      process.exit(1);
    }

    const lessons = [
      {
        subject: toan._id,
        title: "Ôn tập tuyển sinh lớp 10 - Toán [AI]",
        content: "Nội dung bài học Toán mẫu do AI tạo ra. \n\nCác bài giảng, ví dụ và bài tập được tích hợp chi tiết.",
        category: "theory",
        type: "markdown",
        createdBy: systemUserId,
        editorData: { markdown: "Nội dung bài học Toán mẫu do AI tạo ra." },
        isProOnly: false,
        isAIGenerated: true
      },
      {
        subject: van._id,
        title: "Ôn tập tuyển sinh lớp 10 - Văn [AI]",
        content: "Nội dung bài học Văn mẫu do AI tạo ra. \n\nBao gồm bài giảng, phân tích tác phẩm và bài tập ôn tập.",
        category: "theory",
        type: "markdown",
        createdBy: systemUserId,
        editorData: { markdown: "Nội dung bài học Văn mẫu do AI tạo ra." },
        isProOnly: false,
        isAIGenerated: true
      },
      {
        subject: anh._id,
        title: "Ôn tập tuyển sinh lớp 10 - Anh [AI]",
        content: "Nội dung bài học Anh mẫu do AI tạo ra. \n\nBao gồm phần từ vựng, ngữ pháp và bài tập luyện nghe.",
        category: "theory",
        type: "markdown",
        createdBy: systemUserId,
        editorData: { markdown: "Nội dung bài học Anh mẫu do AI tạo ra." },
        isProOnly: false,
        isAIGenerated: true
      }
    ];

    await Lesson.insertMany(lessons);
    console.log("Seeding successful: Bài học mẫu đã được tạo.");
    process.exit(0);
  } catch (error) {
    console.error("Seeding error:", error);
    process.exit(1);
  }
}

seedLessons();
