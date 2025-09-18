// models/Lesson.js
const mongoose = require('mongoose');

const LessonSchema = new mongoose.Schema({
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  title: { type: String, required: true },
  content: { type: String }, // Dùng để lưu câu hỏi hoặc nội dung hiển thị chung
  category: { 
    type: String, 
    required: true, 
    enum: ['grammar', 'vocabulary', 'exercise', 'theory', 'reading', 'listening', 'other'] 
  },
  type: { 
    type: String, 
    enum: ['markdown', 'quiz', 'video', 'essay'],  // thêm 'essay'
    default: 'markdown' 
  },
  editorData: { type: mongoose.Schema.Types.Mixed }, // Đối với markdown, quiz, video, hoặc essay (đáp án mẫu)
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  tags: [{ type: String, trim: true, index: true }], 
  isProOnly: { type: Boolean, default: false },
  isAIGenerated: { type: Boolean, default: false }
});

module.exports = mongoose.model('Lesson', LessonSchema);
