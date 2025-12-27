const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, slug: 'title', unique: true }, // Cần plugin mongoose-slug-generator
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    description: String,
    thumbnail: String,
    isPublished: { type: Boolean, default: true }, // Mặc định public cho nhanh

    // TRƯỜNG MỚI: Chứa cấu trúc cây dạng JSON string (Bản nháp)
    draftTree: { type: String, default: null },
    // Lưu lại ID bài học cuối cùng đang sửa để mở lại đúng chỗ đó
    lastEditedLessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }
}, { timestamps: true, toJSON: { virtuals: true } });

// Virtual để lấy danh sách Chương
courseSchema.virtual('units', {
    ref: 'Unit',
    localField: '_id',
    foreignField: 'courseId',
    options: { sort: { order: 1 } }
});

module.exports = mongoose.model('Course', courseSchema);