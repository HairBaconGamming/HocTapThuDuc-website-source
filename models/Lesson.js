const mongoose = require('mongoose');
const slug = require('mongoose-slug-updater'); // <-- Đổi thành updater

// Kích hoạt plugin tạo slug tự động
mongoose.plugin(slug);

const lessonSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, slug: "title", unique: true },
    content: { type: String },
    
    // --- QUAN TRỌNG: FIX LỖI POPULATE ---
    // Phải có dòng này thì .populate('subject') mới hoạt động
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }, 
    
    // --- CẤU TRÚC PHÂN CẤP MỚI ---
    // (Dùng cho tính năng Tree/Course/Unit vừa nâng cấp)
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }, // Backup field nếu cần query theo id trực tiếp
    
    order: { type: Number, default: 0 }, // Thứ tự bài học trong chương

    // --- PHÂN LOẠI & NỘI DUNG ---
    category: { type: String },
    type: { type: String, default: 'theory' }, // theory, video, quiz, essay, document...
    
    // --- DỮ LIỆU EDITOR ---
    editorData: { type: Object }, // Lưu JSON từ Editor mới
    quizData: { type: Array },    // Dữ liệu câu hỏi (Legacy)
    essayData: { type: Array },   // Dữ liệu tự luận
    
    // --- META DATA ---
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isPro: { type: Boolean, default: false },      // Yêu cầu VIP (Mới)
    isProOnly: { type: Boolean, default: false },  // Yêu cầu VIP (Cũ - giữ để tương thích)
    isPublished: { type: Boolean, default: true }, // Trạng thái đăng bài
    
    tags: [String],
    views: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Lesson', lessonSchema);